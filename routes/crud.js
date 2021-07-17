var express = require("express");
var pg = require("pg");
var crud = require("express").Router();
var fs = require("fs");
crud.use(express.urlencoded({ extended: true }));

var configtext =
  "" + fs.readFileSync("/home/hanhaguo/certs/postGISConnection.js");
// now convert the configruation file into the correct format -i.e. a name/value pair array
var configarray = configtext.split(",");
var config = {};
for (var i = 0; i < configarray.length; i++) {
  var split = configarray[i].split(":");
  config[split[0].trim()] = split[1].trim();
}
var pool = new pg.Pool(config);
console.log(config);

// test endpoint for GET requests (can be called from a browser URL or AJAX)
crud.get("/testCRUD", function (req, res) {
  res.json({ message: req.originalUrl + " " + "GET REQUEST" });
});
// test endpoint for POST requests - can only be called from AJAX
crud.post("/testCRUD", function (req, res) {
  res.json({ message: req.body });
});

/**
 * Insert the quiz to database
 */
crud.post("/insertPlanning", function (req, res) {
  pool.connect(function (err, client, done) {
    if (err) {
      console.log("not able to get connection " + err);
      res.status(400).send(err);
    }

    var longitude = req.body.longitude;
    var latitude = req.body.latitude;
    var name = req.body.name;

    var geometryString =
      "st_geomfromtext('POINT(" + longitude + " " + latitude + ")',4326)";

    var querystring =
      "INSERT into uceshg0.planning (name,location) values ";
    querystring += "($1,";

    querystring += geometryString + ")";

    console.log(querystring);
    client.query(
      querystring,
      [
        name,
      ],
      function (err, result) {
        done();
        if (err) {
          console.log(err);
          res.status(400).send(err);
        }
        res
          .status(200)
          .send("Planning " + req.body.name + " has been inserted");
      }
    );
  });
});


module.exports = crud;
