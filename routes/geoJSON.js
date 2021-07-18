var express = require("express");
var pg = require("pg");
var geoJSON = require("express").Router();
var fs = require("fs");
const e = require("express");
var configtext =
  "" + fs.readFileSync("/app/certs/postGISConnection.js");
// now convert the configruation file into the correct format -i.e. a name/value pair array
var configarray = configtext.split(",");
var config = {};
for (var i = 0; i < configarray.length; i++) {
  var split = configarray[i].split(":");
  config[split[0].trim()] = split[1].trim();
}
var pool = new pg.Pool(config);
console.log(config);
module.exports = geoJSON;

geoJSON.route("/testGeoJSON").get(function (req, res) {
  res.json({ message: "hello world" });
});

geoJSON.get("/postgistest", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }
    client.query(
      " select * from information_schema.columns",
      function (err, result) {
        done();
        if (err) {
          console.log(err);
          res.status(400).send(err);
        }
        res.status(200).send(result.rows);
      }
    );
  });
});

geoJSON.get("/getSensors", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }
    var querystring =
      " SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM ";
    querystring =
      querystring +
      "(SELECT 'Feature' As type, ST_AsGeoJSON(st_transform(lg.location,4326))::json As geometry, ";
    querystring =
      querystring +
      "row_to_json((SELECT l FROM (SELECT sensor_id, sensor_name, sensor_make, sensor_installation_date, room_id) As l )) As properties";
    querystring =
      querystring + " FROM ucfscde.temperature_sensors As lg limit 100 ) As f";
    client.query(querystring, function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

geoJSON.get(
  "/getGeoJSON/:schemaname/:tablename/:idcolumn/:geomcolumn",
  function (req, res) {
    pool.connect(function (err, client, done) {
      if (err) {
        console.log("not able to get connection " + err);
        res.status(400).send(err);
      }
      var colnames = "";
      // first get a list of the columns that are in the table
      // use string_agg to generate a comma separated list that can then be pasted into the next query
      var tablename = req.params.tablename;
      var schema = req.params.schemaname;
      var idcolumn = req.params.idcolumn;
      var geomcolumn = req.params.geomcolumn;
      var geomcolumnJSON = JSON.stringify(geomcolumn);
      var tablenameJSON = schema + "." + tablename;
      var querystring =
        "select string_agg(colname,',') from ( select column_name as colname ";
      querystring =
        querystring + " FROM information_schema.columns as colname ";
      querystring = querystring + " where table_name =$1";
      querystring =
        querystring +
        " and column_name <> $2 and table_schema = $3 and data_type <> 'USER-DEFINED') as cols ";
      console.log(querystring);
      // now run the query
      client.query(
        querystring,
        [tablename, geomcolumn, schema],
        function (err, result) {
          if (err) {
            console.log(err);
            res.status(400).send(err);
          }
          thecolnames = result.rows[0].string_agg;
          colnames = thecolnames;
          console.log("the colnames " + thecolnames);
          // SQL injection prevention - check that the ID column exists
          if (thecolnames.toLowerCase().indexOf(idcolumn.toLowerCase()) > -1) {
            var cols = colnames.split(",");
            var colString = "";
            for (var i = 0; i < cols.length; i++) {
              console.log(cols[i]);
              colString = colString + JSON.stringify(cols[i]) + ",";
            }
            console.log(colString);
            //remove the extra comma
            colString = colString.substring(0, colString.length - 1);
            // now use the inbuilt geoJSON functionality
            // and create the required geoJSON format using a query adapted from here:
            // http://www.postgresonline.com/journal/archives/267-Creating-GeoJSONFeature-Collections-with-JSON-and-PostGIS-functions.html, accessed 4th January 2018 // note that query needs to be a single string with no line breaks so built it up bit by bit simple geometries
            // to overcome the polyhedral surface issue, convert them to // assume that all tables have an id field for now - to do add the name of the id field as a parameter array_to_json(array_agg(f)) As features FROM ";
            querystring =
              "SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM ";
            querystring +=
              "(select 'Feature' as type, x.properties,st_asgeojson(y.geometry)::json as geometry from ";
            querystring +=
              " (select " +
              idcolumn +
              ", row_to_json((SELECT l FROM (SELECT " +
              colString +
              ") As l )) as properties FROM " +
              schema +
              "." +
              JSON.stringify(tablename);
            querystring += " ) x";
            querystring +=
              " inner join (SELECT " + idcolumn + ", c.geom as geometry";
            querystring +=
              " FROM ( SELECT " +
              idcolumn +
              ",(ST_Dump(st_transform(" +
              geomcolumn +
              ",4326))).geom AS geom ";
            querystring +=
              " FROM " +
              schema +
              "." +
              JSON.stringify(tablename) +
              ") c) y on y." +
              idcolumn +
              " = x." +
              idcolumn +
              ") f";
            console.log(querystring);
            client.query(querystring, function (err, result) {
              //call `done()` to release the client back to the pool
              done();
              if (err) {
                console.log(err);
                res.status(400).send(err);
              }
              // remove the extra [ ] from the GeoJSON as this won't work with QGIS
              var geoJSONData = JSON.stringify(result.rows);
              geoJSONData = geoJSONData.substring(1);
              geoJSONData = geoJSONData.substring(0, geoJSONData.length - 1);
              console.log(geoJSONData);
              res.status(200).send(JSON.parse(geoJSONData));
            }); // end of the geoJSON query
          } // the ID column name isn't in the list - so there is some attempt at injection
          else {
            res.status(400).send("Invalid ID column name");
          }
        }
      );
    }); // end of the pool
  }
); // end of the function

/**
 * The endpoint to get all the question set by the user
 */
geoJSON.get("/geoJSONUserId/:user_id", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }

    var user_id = req.params.user_id;
    console.log(user_id);

    var colnames = "id, question_title, question_text, answer_1,";
    colnames =
      colnames + "answer_2, answer_3, answer_4, user_id, correct_answer";
    console.log("colnames are " + colnames);

    var querystring =
      " SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features  FROM ";
    querystring +=
      "(SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry, ";
    querystring +=
      "row_to_json((SELECT l FROM (SELECT " +
      colnames +
      " ) As l      )) As properties";
    querystring += "   FROM cege0043.quizquestions As lg ";
    querystring += " where user_id = $1 limit 100  ) As f ";
    console.log(querystring);


    client.query(querystring, [user_id], function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Return the number of the correct answer user answered
 */
geoJSON.get("/userQuestions/:user_id", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }

    var user_id = req.params.user_id;
    var querystring =
      " select array_to_json (array_agg(c)) from ";
    querystring +=
      "(SELECT COUNT(*) AS num_questions from cege0043.quizanswers where (answer_selected = correct_answer) and user_id = $1) c;";

    console.log(querystring);


    client.query(querystring, [user_id], function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Return the rank of the user
 */
geoJSON.get("/userRanking/:user_id", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }

    var user_id = req.params.user_id;
    var querystring =
      " select array_to_json (array_agg(hh)) from ";
    querystring +=
      "(select c.rank from (SELECT b.user_id, rank() over (order by num_questions desc) as rank ";
    querystring +=
      "from (select COUNT(*) AS num_questions, user_id from cege0043.quizanswers ";
      querystring +=
      "where answer_selected = correct_answer group by user_id) b) c where c.user_id = $1) hh;";

    console.log(querystring);


    client.query(querystring, [user_id], function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Retturn the json data of top five scorers
 */
geoJSON.get("/topFiveScorers", function (req, res) {

  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }

    var querystring =
      " select array_to_json (array_agg(c)) from  ";
    querystring +=
      "(select rank() over (order by num_questions desc) as rank , user_id ";
    querystring +=
      "from (select COUNT(*) AS num_questions, user_id ";
      querystring +=
      "from cege0043.quizanswers where answer_selected = correct_answer group by user_id) b limit 5) c;;";

    console.log(querystring);


    client.query(querystring, function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Return the daily participation rates by the user
 */
geoJSON.get("/dailyParticipationRates/:user_id", function (req, res) {

  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }
    var user_id = req.params.user_id;
    
    var querystring =
      " select array_to_json (array_agg(c)) from  ";
    querystring +=
      "(select * from cege0043.participation_rates where user_id = $1) c; ";

    console.log(querystring);


    client.query(querystring, [user_id], function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Return the daily participation rates
 */
geoJSON.get("/dailyParticipationRates", function (req, res) {

  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }    
    var querystring =
      `select  array_to_json (array_agg(c)) from 
      (select day, sum(questions_answered) as questions_answered, sum(questions_correct) as questions_correct
      from cege0043.participation_rates
      group by day) c `;

    console.log(querystring);


    client.query(querystring, function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  });
});

/**
 * Return the geojson data for the questions, based on the type of the questions. 
 */
geoJSON.get("/questions", function (req, res) {
  if(req.query.condition){
    var condition = req.query.condition;
    var queryString = `
      SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features  FROM
        (SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry,
        row_to_json((SELECT l FROM (SELECT id, question_title, question_text, answer_1, answer_2, answer_3, answer_4, user_id, correct_answer) As l 
        )) As properties FROM cege0043.quizquestions As lg `;

    if (condition == "lastWeek") {
      queryString += "where timestamp > NOW()::DATE-EXTRACT(DOW FROM NOW())::INTEGER-7  limit 100  ) As f;";
    } else if (condition == "all") {
      queryString += ") As f;";
    } else if (condition == "difficult") {
      queryString = `SELECT 'FeatureCollection' As type, array_to_json (array_agg(d)) As features from
      (SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry, 
      row_to_json((SELECT l FROM (SELECT id, question_title, question_text, answer_1, answer_2, answer_3, answer_4, user_id, correct_answer) As l 
      )) As properties
      FROM  
      (select c.* from cege0043.quizquestions c
      inner join 
      (select count(*) as incorrectanswers, question_id from cege0043.quizanswers where 
      answer_selected <> correct_answer
      group by question_id
      order by incorrectanswers desc
      limit 5) b
      on b.question_id = c.id)as lg) As d;`;
    } else if (condition == "lastAnswered") {
      var userId = req.query.user_id;
      queryString = `SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features  FROM 
      (SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry, 
      row_to_json((SELECT l FROM (SELECT id, question_title, question_text, answer_1, answer_2, answer_3, answer_4, user_id, correct_answer, answer_correct) As l 
       )) As properties
       FROM 
      (select a.*, b.answer_correct from cege0043.quizquestions a
      inner join 
      (select question_id, answer_selected=correct_answer as answer_correct
      from cege0043.quizanswers
      where user_id = ${userId}
      order by created_at desc
      limit 5) b
      on a.id = b.question_id) as lg) As f`;
    } else if (condition == "notAnswered") {
      var userId = req.query.user_id;
      queryString = `SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features  FROM 
      (SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry, 
      row_to_json((SELECT l FROM (SELECT id, question_title, question_text, answer_1, answer_2, answer_3, answer_4, user_id, correct_answer) As l 
       )) As properties
       FROM 
      (select * from cege0043.quizquestions
        where user_id = ${userId} and id not in (
        select question_id from cege0043.quizanswers
        where answer_selected = correct_answer)
        union all
        select * from cege0043.quizquestions
        where id not in (select question_id from cege0043.quizanswers)
      ) as lg) As f`;
    } else {
      queryString += ") As f;";
    }
  } else if(req.query.latitude){
    var latitude = req.query.latitude;
    var longitude = req.query.longitude;
    var queryString = `
    SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features  FROM 
    (SELECT 'Feature' As type     , ST_AsGeoJSON(lg.location)::json As geometry, 
    row_to_json((SELECT l FROM (SELECT id, question_title, question_text, answer_1, answer_2, answer_3, answer_4, user_id, correct_answer) As l 
     )) As properties
     FROM   (select c.* from cege0043.quizquestions c 
    inner join (select id, st_distance(a.location, st_geomfromtext('POINT(${longitude} ${latitude})',4326)) as distance 
    from cege0043.quizquestions a 
    order by distance asc 
    limit 5) b 
    on c.id = b.id ) as lg) As f; `;
  }
  
  pool.connect(function (err, client, done) {
    

    console.log(queryString);

    client.query(queryString, function (err, result) {
      done();
      if (err) {
        console.log(err);
        res.status(400).send(err);
      }
      res.status(200).send(result.rows);
    });
  })

});


