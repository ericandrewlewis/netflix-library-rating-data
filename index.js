const fs = require('fs');
const requestAsync = require('request-promise');
const movieData = fs.readFileSync(`${__dirname}/node_modules/netflix-library-crawler/output/All-Movies`, 'utf8').split('\n');

// Set process.env based on values in .env file
require('dotenv').config();

const imdbApiUrl = (title) => {
  return `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${process.env.OMDB_API_KEY}`;
}

const ratingTextRegex = /Rating:\s(\d(?:\.\d)?)\/10/;

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
              console.log(`Could not find info for ${title}`);
              return;
            }
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
    requestPromises.push(
      new Promise((resolve, reject) => {
        setTimeout(resolve, 200);
      })
    );
    return Promise.all(requestPromises)
      .then(getMovieRatingData);
  }
  return getMovieRatingData();
}

getAllMoviesRatingData()
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
    console.log(ratings);
  })
