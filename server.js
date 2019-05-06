'use strict';

//--------------------------------
// Load Enviroment Variables from the .env file
//--------------------------------
require('dotenv').config();

//--------------------------------
// Application Dependencies
//--------------------------------
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//--------------------------------
// Database Configuration
//--------------------------------
// 1. Create a client with connection url

const client = new pg.Client(process.env.DATABASE_URL);

//2. Connect client

client.connect();

// 3. Add event listeners

client.on('err', err => console.log(err));


//--------------------------------
// Application setup
//--------------------------------
const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());

//--------------------------------
// Helper Func
//--------------------------------

let lookup = (handler) => {
  const SQL = `SELECT * FROM ${handler.tableName} WHERE location_id=$1;`;

  return client.query(SQL, [handler.location.id])
    .then(result => {
      if (result.rowCount > 0){
        handler.cacheHit(result);
      }else {
        handler.cacheMiss();
      }
    })
    .catch(errorMessage);
};

let deleteByLocationId = (table, location_id) => {
  const SQL = `DELETE FROM ${table} WHERE location_id=${location_id}`;

  return client.query(SQL);
};

const timeouts = {
  weather: 15 * 1000, //15 seconds per request
  event: 60 * 60 * 1000, //hourly update for latest events
  movie: 60 * 60 * 24 * 1000, // daily movies updates
  yelp: 60 * 60 * 4 * 1000 // update every 4 hours
};

//--------------------------------
// Error Message
//--------------------------------

// This a error message callback function which will send a server status message of 500, if an internal server error is encountered.

let errorMessage = (error, response) => {
  console.error(error);
  if (response) response.status(500).send('Internal server error encountered');
};

//--------------------------------
// Constructors Functions
//--------------------------------

// Constructor functions which filter the data from the query response that we are interested in.

//--------------------------------
// Locations
//--------------------------------

function CityLocation(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}

CityLocation.tableName = 'locations';

CityLocation.fetchLocation = (query) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(result => {
      if(!result.body.results.length) throw 'No data';
      let location = new CityLocation(query, result.body.results[0]);
      return location.save()
        .then(result => {
          location.id = result.rows[0].id;
          return location;
        });
    });
};


CityLocation.lookup = handler => {
  const SQL = 'SELECT * FROM locations WHERE search_query=$1;';
  const values = [handler.query];

  return client.query(SQL, values)
    .then(results => {
      if(results.rowCount > 0){
        handler.cacheHit(results);
      }else{
        handler.cacheMiss(results);
      }
    })
    .catch(console.error);
};

CityLocation.prototype.save = function(){
  let SQL = `INSERT INTO locations
    (search_query, formatted_query, latitude, longitude)
    VALUES ($1, $2, $3, $4)
    RETURNING id;`;

  let values = Object.values(this);

  return client.query(SQL, values);
};

//--------------------------------
// Weather
//--------------------------------

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
Weather.deleteByLocationId = deleteByLocationId;

Weather.fetchWeather = (location) => {
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${location.latitude},${location.longitude}`;

  return superagent.get(url)
    .then(result => {
      const weatherSum = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(location.id);
        return summary;
      });
      return weatherSum;
    })
    .catch(console.error);
};

Weather.prototype.save = function(id){
  const SQL = `INSERT INTO weathers
    (forecast, time, created_at, location_id)
    VALUES ($1, $2, $3, $4);`;

  const values = Object.values(this);
  values.push(id);

  return client.query(SQL, values);
};

//--------------------------------
// Events
//--------------------------------

function Events(location) {
  let time = Date.parse(location.start.local);
  this.event_date = new Date(time).toDateString();
  this.link = location.url;
  this.name = location.name.text;
  this.summary = location.summary;
  this.created_at = Date.now();
}

Events.tableName = 'weathers';
Events.lookup = lookup;
Events.deleteByLocationId = deleteByLocationId;

Events.fetchEvent = (location) => {
  const url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${location.formatted_query}`;
  return superagent.get(url)
    .then(result => {
      const eventSum = result.body.events.map(event => {
        const summary = new Events(event);
        summary.save(location.id);
        return summary;
      });
      return eventSum;
    })
    .catch(console.error);
};

Events.prototype.save = function(id){
  const SQL = `INSERT INTO events
    (date, link, name, summary, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6);`;

  const values = Object.values(this);
  values.push(id);

  return client.query(SQL, values);
};


//--------------------------------
// Movies
//--------------------------------

function Movies(location) {
  this.title = location.title;
  this.released_on = location.release_date;
  this.total_votes = location.vote_count;
  this.average_votes = location.vote_average;
  this.popularity = location.popularity;
  this.overview = location.overview;
  this.image_url = `https://image.tmdb.org/t/p/original${location.poster_path}`;
  this.created_at = Date.now();
}

Movies.tableName = 'movies';
Movies.lookup = lookup;
Movies.deleteByLocationId = deleteByLocationId;

Movies.prototype.save = function(id){
  const SQL = `INSERT INTO movies
    (title, released_on, total_votes, average_votes, popularity, overview, image_url, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;

  let values = Object.values(this);
  values.push(id);

  return client.query(SQL, values);
};

Movies.fetchMovie = (location) => {
  const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1`;
  return superagent.get(url)
    .then(result => {
      const movieSummaries = result.body.results.map(movie => {
        const summary = new Movies(movie);
        summary.save(location.id);
        return summary;
      });
      return movieSummaries;
    })
    .catch(console.error);
};

//--------------------------------
// Yelps
//--------------------------------

function Yelp(location) {
  this.name = location.name;
  this.rating = location.rating;
  this.price = location.price;
  this.url = location.url;
  this.image_url = location.image_url;
  this.created_at = Date.now();
}

Yelp.tableName = 'yelps';
Yelp.lookup = lookup;
Yelp.deleteByLocationId = deleteByLocationId;

Yelp.prototype.save = function(id){
  const SQL = `INSERT INTO yelps
    (name, rating, price, url, image_url, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7);`;

  let values = Object.values(this);
  values.push(id);

  return client.query(SQL, values);
};

Yelp.fetchYelp = (location) => {
  const url = `https://api.yelp.com/v3/businesses/search?location=${location.search_query}`;

  return superagent.get(url)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpSummaries = result.body.businesses.map(review => {
        const summary = new Yelp(review);
        summary.save(location.id);
        return summary;
      });
      return yelpSummaries;
    })
    .catch(console.error);
};

//--------------------------------
// Route Callbacks
//--------------------------------

// Locations
let searchCoords = (request, response) => {
  const locationHandler = {
    query: request.query.data,
    cacheHit: results => {
      console.log('Got data from DB');
      response.send(results.rows[0]);

    },
    cacheMiss: () => {
      console.log('Fetching location....');
      CityLocation.fetchLocation(request.query.data)
        .then(results => response.send(results));
    }
  };
  CityLocation.lookup(locationHandler);
};

// Weathers
let searchWeather = (request, response) => {
  const weatherHandler = {
    location: request.query.data,
    tableName: Weather.tableName,
    cacheHit: function(result){
      let ageOfRes = (Date.now() - result.rows[0].created_at);
      if (ageOfRes > timeouts.weather){
        console.log('Weather cache is invaild');
        Weather.deleteByLocationId(Weather.tableName, request.query.data.id);
        this.cacheMiss();
      }else {
        console.log('Weather cache valid');
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      console.log('Fetching weather...');
      Weather.fetchWeather(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    }
  };
  Weather.lookup(weatherHandler);
};

// Events
let seachEvents = (request, response) => {
  const eventHandler = {
    location: request.query.data,
    tableName: Events.tableName,
    cacheHit: function(result){
      let ageOfRes = (Date.now() - result.rows[0].created_at);
      if (ageOfRes > timeouts.event){
        console.log('Event cache is invailid');
        Events.deleteByLocationId(Events.tableName, request.query.data.id);
        this.cacheMiss();
      } else {
        console.log('Events cache valid');
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      console.log('Fetching events...');
      Events.fetchEvent(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    }
  };
  Events.lookup(eventHandler);
};

// Movies
let searchMovies = (request, response) => {
  const eventHandler = {
    location: request.query.data,
    tableName: Movies.tableName,
    cacheHit: function(result){
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.movie){
        console.log('Movie cache was invalid');
        Movies.deleteByLocationId(Movies.tableName, request.query.data.id);
        this.cacheMiss;
      } else {
        console.log('Movie cache was valid');
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      console.log('Fetching movies...');
      Movies.fetchMovie(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    }
  };
  Movies.lookup(eventHandler);
};

// Yelps
let searchYelps = (request, response) => {
  const eventHandler = {
    location: request.query.data,
    tableName: Yelp.tableName,
    cacheHit: function(result){
      let ageOfResults = (Date.now() - result.rows[0].created_at);
      if(ageOfResults > timeouts.yelp){
        console.log('Yelp cache was invalid');
        Yelp.deleteByLocationId(Yelp.tableName, request.query.data.id);
        this.cacheMiss;
      } else {
        console.log('Yelp cache was valid');
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      console.log('Fetching yelps...');
      Yelp.fetchYelp(request.query.data)
        .then(results => response.send(results))
        .catch(console.error);
    }
  };
  Yelp.lookup(eventHandler);
};


//--------------------------------
// Routes
//--------------------------------

// Refer to how our application enpoints (URI) respond to the client requests.

app.get('/location', searchCoords);
app.get('/weather', searchWeather);
app.get('/events', seachEvents);
app.get('/movies', searchMovies);
app.get('/yelps', searchYelps);


//--------------------------------
// Power On
//--------------------------------
app.listen(PORT, () => console.log(`app is listening ${PORT}`));
