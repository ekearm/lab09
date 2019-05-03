DROP TABLE IF EXISTS  weathers;
DROP TABLE IF EXISTS  locations;
DROP TABLE IF EXISTS events;

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
)
