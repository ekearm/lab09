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
// Error Message
//--------------------------------

// This a error message callback function which will send a server status message of 500, if an internal server error is encountered.

let errorMessage = (error, response) => {
  console.error(error);
  if (response) response.status(500).send('internal server error encountered');
};

//--------------------------------
// Constructors Functions
//--------------------------------

// Constructor functions which filter the data from the query response that we are interested in.

function CityLocation(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}

// Static function

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

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toString().slice(0, 15);
}

Weather.fetchWeather = (query) => {
  const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;

  return superagent.get(url)
    .then(result => {
      console.log(result.body);
      if (!result.body.daily.data.length) throw 'No data';
      const weatherSum = result.body.daily.data.map( day => new Weather(day));
      return weatherSum.save()
        .then(result => {
          weatherSum.id = result.rows[0].id;
          return weatherSum;
        });
    })
    .catch(console.error);
};

Weather.lookup = handler => {
  const SQL = 'SELECT * FROM weathers WHERE forecast=$1;';
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

Weather.prototype.save = function(){
  let SQL = `INSERT INTO weathers
    (forecast, time, location_id)
    VALUES ($1, $2, $3)
    RETURNING id;`;

  let values = Object.values(this);

  return client.query(SQL, values);
};

function Events(location) {
  let time = Date.parse(location.start.local);
  let newDate = new Date(time).toDateString();
  this.event_date = newDate;
  this.link = location.url;
  this.name = location.name.text;
  this.summary = location.summary;
}

//--------------------------------
// Route Callbacks
//--------------------------------

// API callback functions that reach out to the internet to the specified APIs for desired data. One for each API serve we are hitting.

let searchCoords = (request, response) => {
  const locationHandler = {
    query: request.query.data,
    cacheHit: results => {
      console.log('Got data from DB');
      response.send(results.rows[0]);
      
    },
    cacheMiss: () => {
      console.log('Fetching ...');
      // console.log(request.query.data);
      CityLocation.fetchLocation(request.query.data)
        .then(results => response.send(results));
    }
  };
  CityLocation.lookup(locationHandler);
};

let searchWeather = (request, response) => {
  // console.log(request);
  const weatherHandler = {
    query: request.query.data,
    cacheHit: results => {
      console.log('Got weather data from DB');
      response.send(results[0]);
      console.log('here');
    },
    cacheMiss: () => {
      console.log('Fetching weather data....');
      Weather.fetchWeather(request.query.data)
        .then(results => response.send(results));
    }
  };
  Weather.lookup(weatherHandler);
};

// let searchWeather = (request, response) => {
//   const data = request.query.data;
//   const url = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${data.latitude},${data.longitude}`;
//   return superagent.get(url)
//     .then(result => {
//       const weatherSum = result.body.daily.data.map( day => {
//         return new Weather(day);
//       });
//       response.send(weatherSum);
//     })
//     .catch(error => errorMessage(error, response));
// };

let seachEvents = (request, response) => {
  const data = request.query.data;
  const url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${data.formatted_query}`;

  return superagent.get(url)
    .then(result => {

      const eventSum = result.body.events.map( eventInfo => {
        return new Events(eventInfo);
      });
      response.send(eventSum);
    })
    .catch(error => errorMessage(error, response));
};

// Dynamic lookup function

// let dynamicLookup = (request, response) => {
  
// };

//--------------------------------
// Routes
//--------------------------------

// Refer to how our application enpoints (URI) respond to the client requests.

app.get('/location', searchCoords);
app.get('/weather', searchWeather);
app.get('/events', seachEvents);

//--------------------------------
// Power On
//--------------------------------
app.listen(PORT, () => console.log(`app is listening ${PORT}`));
