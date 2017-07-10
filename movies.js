const fs = require('fs');
const requestAsync = require('request-promise');

const getMovieData = () => {
  let movies = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/All-Movies`, 'utf8').split('\n');
  let netflixOriginals = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/Netflix-Originals`, 'utf8').split('\n');
  movies = Array.from(new Set([...movies, ...netflixOriginals]));
  return movies;
}

const movieData = getMovieData();

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

const votesRequired = 10000;
const boxOfficeWinnings = 150000;

const boxOfficeDataFixed = (boxOffice) => {
  if (boxOffice === 'N/A') {
    return 0;
  }
  return new Number(boxOffice.replace(/[$\,]/g, ''));
}

const movieIsPopularEnough = (movie) => {
  const hasEnoughVotes = movie.imdbVotes.replace(',', '') > votesRequired;
  let madeEnoughMoneyAtBoxOffice = false;
  if (boxOfficeDataFixed(movie.BoxOffice) > 10000) {
    madeEnoughMoneyAtBoxOffice = true;
  }
  return hasEnoughVotes || madeEnoughMoneyAtBoxOffice;
}

const getAllMoviesRatingData = () => {
  let index = 0;
  const ratings = [];
  const parallelRequestLimit = 2;
  const getMovieRatingData = () => {
    if (index === movieData.length - 1) {
      return ratings;
    }
    const requestPromises = [];
    for (;index < movieData.length - 1 && requestPromises.length < parallelRequestLimit; index++) {
      const title = movieData[index];
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
            if (response.Type !== 'movie') {
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
            const rating = {
              title,
              rating: response.imdbRating,
              genre:  response.Genre
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

getAllMoviesRatingData()
  .then(ratings => {
    console.log(`Completed.\n${stats.found} ratings found\n${stats.notFound} movies could not be found\n${stats.notAMovie} items were not movies\n${stats.noRating} items had no rating\n${stats.notPopularEnough} items was not popular enough to be counted (did not have enough rating votes for box office presence)`);
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
    const fileName = `${__dirname}/output/movies.tsv`;
    fs.writeFile(fileName, text, (err) => {
      if(err) {
        return console.log(err);
      }
      console.log(`Wrote all review data to file ${fileName}`);
    });
    return ratings;
  })
  .then(ratings => {
    const text = `module.exports = ${JSON.stringify(ratings, null, 2)}`;
    const fileName = `${__dirname}/output/movies.js`;
    fs.writeFile(fileName, text, (err) => {
      if(err) {
        return console.log(err);
      }
      console.log(`Wrote all review data to file ${fileName}`);
    });
  });
