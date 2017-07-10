const fs = require('fs');
const requestAsync = require('request-promise');
const tvShows = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/TV-Shows`, 'utf8').split('\n');
const netflixOriginals = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/Netflix-Originals`, 'utf8').split('\n');

const getTvShowData = () => {
  return Array.from(new Set([...tvShows, ...netflixOriginals]));
}
const tvShowData = getTvShowData();

const imdbApiUrl = (title) => {
  return `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${process.env.OMDB_API_KEY}`;
}

const ratingTextRegex = /Rating:\s(\d(?:\.\d)?)\/10/;

const stats = {
  found: 0,
  notFound: 0,
  notAMovie: 0,
  noRating: 0,
  notPopularEnough: 0
};

const votesRequired = 5000;

const movieIsPopularEnough = (movie) => {
  const hasEnoughVotes = movie.imdbVotes.replace(',', '') > votesRequired;
  return hasEnoughVotes;
}

const getAllTVShowsRatingData = () => {
  let index = 0;
  const ratings = [];
  const parallelRequestLimit = 2;
  const getMovieRatingData = () => {
    if (index === tvShowData.length - 1) {
      return ratings;
    }
    const requestPromises = [];
    for (;index < tvShowData.length - 1 && requestPromises.length < parallelRequestLimit; index++) {
      const title = tvShowData[index];
      if (index % 50 === 0) {
        console.log(`Requested ${index} ratings...`);
      }
      requestPromises.push(
        requestAsync({
          uri: imdbApiUrl(title),
          timeout: 3000
        })
          .then((rawResponse) => {
            const response = JSON.parse(rawResponse);
            if (response.Error) {
              stats.notFound++;
              return;
            }
            if (response.Type !== 'series') {
              stats.notAMovie++;
              return;
            }
            if (response.imdbRating === 'N/A') {
              stats.noRating++;
              return;
            }
            if (!movieIsPopularEnough(response)) {
              stats.notPopularEnough++;
              return;
            }
            stats.found++;
            let genre = response.Genre;
            if (netflixOriginals.indexOf(title) > -1) {
              genre += ', Netflix Originals';
            }
            const rating = {
              title,
              rating: response.imdbRating,
              genre
            }
            ratings.push(rating);
          })
          .catch(error => {
            console.log(`There was an error while making a request for ${title}`);
            console.error(error);
          })
      );
    }

    return Promise.all(requestPromises)
      .then(getMovieRatingData);
  }
  return getMovieRatingData();
}

getAllTVShowsRatingData()
  .then(ratings => {
    console.log(`Completed.\n${stats.found} ratings found\n${stats.notFound} movies could not be found\n${stats.notAMovie} items were not movies\n${stats.noRating} items had no rating\n${stats.notPopularEnough} items was not popular enough to be counted (did not have enough rating votes)`);
    return ratings;
  })
  .then(ratings => {
    return ratings.sort((a, b) => {
      if (a.rating < b.rating ) {
        return -1;
      }
      if (b.rating < a.rating ) {
        return 1;
      }
      if (a.title < b.title ) {
        return -1;
      }
      if (b.title < a.title ) {
        return 1;
      }
      return 0;
    });
  })
  .then(ratings => {
    const text = ratings.reduce((accumulator, rating) => {
      accumulator += `${rating.title}\t${rating.rating}\t${rating.genre}\n`;
      return accumulator;
    }, '');
    const fileName = `${__dirname}/output/tv-shows.tsv`;
    fs.writeFile(fileName, text, (err) => {
      if(err) {
        return console.log(err);
      }
      console.log(`Wrote all review data to file ${fileName}`);
    });
  });
