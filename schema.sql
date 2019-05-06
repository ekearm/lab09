DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS yelps;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  search_query VARCHAR(225),
  formatted_query VARCHAR(255),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7)
);

CREATE TABLE weathers (
  id SERIAL PRIMARY KEY,
  forecast VARCHAR(255),
  time VARCHAR(255),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  date VARCHAR(255),
  link VARCHAR(255),
  name VARCHAR(255),
  summary VARCHAR(255),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE movies (
  id SERIAL PRIMARY KEY, 
  title VARCHAR(500),
  released_on VARCHAR(500),
  total_votes BIGINT, 
  average_votes NUMERIC(3, 2),
  popularity NUMERIC(10, 3),
  overview TEXT,
  image_url TEXT, 
  created_at BIGINT, 
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE yelps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  rating NUMERIC(4, 2),
  price VARCHAR(150),
  url TEXT,
  image_url TEXT,
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);
