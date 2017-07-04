const fs = require('fs');
const requestAsync = require('request-promise');
const movieData = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/All-Movies`, 'utf8').split('\n');

// Set process.env based on values in .env file
require('dotenv').config();

const imdbApiUrl = (title) => {
  return `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${process.env.OMDB_API_KEY}`;
}

const ratingTextRegex = /Rating:\s(\d(?:\.\d)?)\/10/;
const stats = {
  found: 0,
  notFound: 0,
  notAMovie: 0,
  noRating: 0,
  tooFewVotes: 0
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
            if (response.imdbVotes < 25) {
              stats.tooFewVotes++;
              return;
            }
            stats.found++;
            const rating = {
              title,
              rating: response.imdbRating
            }
            ratings.push(rating);
          })
          .catch(error => {
            console.log(`There was an error while making a request for ${title}`);
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
    console.log(`Completed.\n${stats.found} ratings found\n${stats.notFound} movies could not be found\n${stats.notAMovie} items were not movies\n${stats.noRating} items had no rating\n${stats.tooFewVotes} items had too few votes (<25) to be counted`);
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
      return 0;
    });
  })
  .then(ratings => {
    const text = ratings.reduce((accumulator, rating) => {
      accumulator += `${rating.title}\t${rating.rating}\n`;
      return accumulator;
    }, '');
    const fileName = `${__dirname}/output/data.tsv`;
    fs.writeFile(fileName, text, (err) => {
      if(err) {
        return console.log(err);
      }
      console.log(`Wrote all review data to file ${fileName}`);
    });
  });
