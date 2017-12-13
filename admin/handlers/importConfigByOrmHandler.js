// This module reads the config (index.json) from request's body and writes the whole config to the database.

"use strict";

var orm = require('orm');
var fs = require('fs');

var createStyleObject = require('./createStyleObject');

var importConfigByOrm = function (req, res) {
  console.log(req.body);
  console.log("Req.files:" + req.files);
  if (req.files) {
    console.log("Importerar från req.files");
    //TODO: SANITYCHECK
    let file1 = req.files.file1;
    if (file1.data) {
      try {
        req.body = JSON.parse(file1.data);
        importJsonData(req, res);
      } catch (err) {
        console.log(err);
      }
    }
  }
  else {
    console.log("Importerar från POST-Body");
    importJsonData(req, res);
  }
};

function importJsonData (req, res) {
  // return new Promise(function(resolve, reject) {

  var Group = req.models.Group;
  var Layer = req.models.Layer;
  var Source = req.models.Source;
  var Attribute = req.models.Attribute;
  var Config = req.models.Config;
  var Control = req.models.Control;
  // var ControlOptions = req.models.ControlOptions;
  var Proj4Defs = req.models.Proj4Defs;
  var Style = req.models.Style;
  var db = req.models.db;

  var index = req.body;
  var layers = index.layers;
  var groups = index.groups;
  var controls = index.controls;
  var styles = index.styles;
  var sources = index.source;

  var config_name = index.configName;

  if (!config_name) {
    var date = new Date();
    var config_name = date.toUTCString();
    // console.log('configuration must have a name as "configName" : "name" ');
    // res.end('configuration must have a name as "configName" . "name" ');
    // return;
  }
  // typeof config_projection_code: string
  // var config_projection_code = Number((index.projectionCode.split(':'))[1]);
  var config_projection_code = index.projectionCode;
  // typeof config_projection_extent: string
  var config_projection_extent = index.projectionExtent.join();
  // typeof config_extent: string
  var config_extent = index.extent.join();
  // typeof config_center: string
  var config_center = index.center.join();
  // typeof config_zoom: number
  var config_zoom = index.zoom;
  // typeof config_resolutions: string
  var config_resolutions = index.resolutions.join();
  // typeof config_featureinfo_options: object
  var config_featureinfo_options = index.featureinfoOptions;
  // this object will not be used in the database Config object, but we need to go through the array, 
  // if there are more proj4Defs, add them to the table if they do not already exist.
  var config_proj4Defs = index.proj4Defs;

  var config;
  var savedGroups = new Map();
  var savedSources = new Map();
  var savedStyles = new Map();
  var savedLayers = new Map();

  // this small peice of code should run only first time to create the database and its tables.
  // after that it connects to an existing database.

  // Problem: db object is not available !
  let syncDatabase = function () {
    return new Promise(function (resolve, reject) {
      db.sync(function (err) {
        if (err) reject(err);
        else {
          console.log('syncing database');
          resolve();
        }
      });
    });
  }

  // OBS! here db is not yet synced, it works if database is already created, 
  // otherwise will throw err because proj4Defs becomes undefined and proj4Defs.lenght will throw error

  // this promise will go through the array of proj4Defs in the index.json,
  // if there are more proj4Defs, add them to the table if they do not already exist.
  let saveProj4defs = function () {
    return new Promise(function (resolve, reject) {
      for (let config_proj4Def of config_proj4Defs) {
        // TODO: use Proj4Defs.exist() istead. 
        Proj4Defs.find({ code: config_proj4Def.code }, function (err, proj4Defs) {
          if (err) reject(err);
          // console.log('length: ' + proj4Defs.length);
          if (proj4Defs.length == 0) {
            let proj4Def = new Proj4Defs({
              code: config_proj4Def.code,
              alias: config_proj4Def.alias,
              projection: config_proj4Def.projection
            });
            Proj4Defs.create(proj4Def, function (err) {
              if (err) reject(err);
              else console.log('proj4defs saved');
            });
          }
        });
      }
      resolve();
    });
  };

  let saveConfig = function () {
    return new Promise(function (resolve, reject) {
      // saving the config using proj4defs from previous promise, is resolved, return config object
      // TODO: use Config.exist() instead
      // Config.find({ name: config_name }, function(err, configs) {
      // Config.find({ name: config_name }, function(err, configs) {
      Config.find({ name: orm.like(config_name + "%") }, function (err, configs) {
        // if a config with this name already exists in the database we create and save a new config with a new name.
        // new name will be the name followed by -kopia- and a counter number. 
        if (configs.length > 0) {
          console.log('Number of configs that start with ' + config_name + ' : ' + configs.length);
          var names = [];
          configs.forEach(element => {
            names.push(element.name);
          });
          if (names.includes(config_name)) {
            var counter = 0;
            do {
              counter++;
              var newName = config_name + '-kopia-' + counter;
            } while (names.includes(newName));
            config_name = newName;
          }
        }
        //if (configs.length == 0) {
        config = new Config({
          name: config_name,
          // projection_code: config_projection_code, // we rely only on proj4defs_id, no need to save the code in config table
          projection_extent: config_projection_extent,
          extent: config_extent,
          center: config_center,
          zoom: config_zoom,
          resolutions: config_resolutions,
          featureinfo_options: config_featureinfo_options
        });

        Proj4Defs.find({ code: config_projection_code }, function (err, proj4Defs) {
          if (err) reject(err);
          //OBS! it seems like a bug and is strange but when a value is set on an object it will be saved to db automatically even though we have set 'autoSave = false' in the settings! 
          config.setProj4Defs(proj4Defs[0], function (err) {
            if (err) reject(err);
            // Now from here a full config object is available
            // res.end(JSON.stringify(layers));
            console.log('config saved');
            resolve();
          });
        });
        //}
      });
    });
  };

  let saveAllGroups = function () {
    return new Promise(function (resolve, reject) {
      // try saving all groups and if resolved return a Map with id, name of the groups
      var groupOrderNumber = 1;
      var data = [];
      for (let group of groups) {
        group.order_number = groupOrderNumber++;
        data.push({
          name: group.name,
          title: group.title,
          parent: group.parent,
          expanded: group.expanded,
          order_number: group.order_number,
          // this line was added later and is not part of the original db design
          config_id: config.id
        });
      }
      Group.create(data, function (err, results) {
        if (err) {
          reject(err);
        } else {
          for (let result of results) {
            savedGroups.set(result.name, result);
          }
          console.log("saving all groups");
          resolve();
        }
      });
    });
  };

  let saveAllSources = function () {
    return new Promise(function (resolve, reject) {
      // saving all source and if resolved return a Map with id, name of source
      // sorces are saved if they do not alrady exist and existence is checked based on their url and not name!
      Source.find(function (err, sourcesFromDatabase) {
        var data = [];
        for (let sourceName of Object.keys(sources)) {
          var sourceFromDatabase = sourcesFromDatabase.find(function (item) {
            return item.url == sources[sourceName].url;
          });
          if (sourceFromDatabase) {
            console.log('source "' + sourceName + '" already exist by the name : ' + sourceFromDatabase.name);
            savedSources.set(sourceName, sourceFromDatabase);
          } else {
            data.push({
              name: sourceName,
              url: sources[sourceName].url,
              version: sources[sourceName].version
            });
          }
        }

        Source.create(data, function (err, results) {
          if (err) {
            reject(err);
          } else {
            for (let result of results) {
              savedSources.set(result.name, result);
              console.log(result.name + ' was saved in the database.');
            }
            console.log("saving all sources");
            resolve();
          }
        });
      });
    });
  };

  let saveAllStyles = function () {
    return new Promise(function (resolve, reject) {
      // saving all styles and if resolved return a Map with id, name of source
      var data = [];
      for (let styleName of Object.keys(styles)) {
        var styleOptions = styles[styleName];
        data.push(createStyleObject(styleName, styleOptions));
      }
      Style.create(data, function (err, results) {
        if (err) {
          reject(err);
        } else {
          for (let result of results) {
            savedStyles.set(result.name, result);
          }
          console.log('saving all styles');
          resolve();
        }
      });
    });
  };

  let saveAllLayers = function () {
    return new Promise(function (resolve, reject) {
      // saving all layers using config and groups
      var layerOrderNumber = 1;
      var data = [];
      for (let layer of layers) {
        let group = savedGroups.get(layer.group);
        if (!group) {
          console.log('layer ' + layer.name + ' has no group or group deos not exist in groups!');
          reject(Error('layer ' + layer.name + ' has no group or group deos not exist in groups!'));
          return;
        }
        let source = savedSources.get(layer.source);
        if (!source) {
          console.log('layer ' + layer.name + ' has no source or source deos not exist in source!');
          reject(Error('layer ' + layer.name + ' has no source or source deos not exist in source!'));
          return;
        }
        let style = savedStyles.get(layer.style);
        if (!style) {
          console.log('layer ' + layer.name + ' has no style or style deos not exist in styles!');
          reject(Error('layer ' + layer.name + ' has no style or style deos not exist in styles!'));
          return;
        }
        layer.order_number = layerOrderNumber++;
        data.push({
          name: layer.name,
          name_id: layer.id,
          title: layer.title,
          format: layer.format,
          queryable: layer.queryable,
          visible: layer.visible,
          type: layer.type,
          attribution: layer.attribution,
          order_number: layer.order_number,
          config_id: config.id,
          group_id: group.id,
          source_id: source.id,
          style_id: style.id
        });
      }
      Layer.create(data, function (err, results) {
        if (err) {
          reject(err);
        } else {
          for (let result of results) {
            savedLayers.set(result.name, result);
          }
          console.log('saving all layers');
          resolve();
        }
      });
    });
  };

  let saveAllAttributes = function () {
    return new Promise(function (resolve, reject) {
      // saving all attributes using layer id
      var data = [];
      for (let layer of layers) {
        let attributes = layer.attributes || undefined;
        let savedLayer = savedLayers.get(layer.name);
        if (!attributes || attributes.length == 0) continue;
        for (let attribute of attributes) {
          data.push({
            name: attribute.name,
            title: attribute.title,
            url: attribute.url,
            url_title: attribute.urltitle,
            layer_id: savedLayer.id
          });
        }
      }
      Attribute.create(data, function (err, results) {
        if (err) {
          reject(err);
        } else {
          console.log('saving all attributes');
          resolve();
        }
      });
    });
  };

  let saveAllControls = function () {
    return new Promise(function (resolve, reject) {
      // saving all controls and if resolved return a Map with id, name of control
      var data = [];
      for (let control of controls) {
        data.push({
          name: control.name,
          config_id: config.id,
          options: control.options
        });
      }
      Control.create(data, function (err, results) {
        if (err) {
          reject(err);
        } else {
          console.log("saving all controls");
          resolve();
        }
      });
    });
  };

  syncDatabase().then(function () {
    return saveProj4defs();
  }).then(function () {
    return saveConfig();
  }).then(function () {
    return saveAllGroups();
  }).then(function () {
    return saveAllSources();
  }).then(function () {
    return saveAllStyles();
  }).then(function () {
    return saveAllLayers();
  }).then(function () {
    return saveAllAttributes();
  }).then(function () {
    return saveAllControls();
  }).then(function () {
    console.log('done!');
    res.status(200).send({});
  }).catch(function (error) {
    console.log(error);
    // exceptionMessage is used in order to signal adminapi that there is an error, see method of basePostFormAsMultiData in adminapi.
    res.status(400).json({ exceptionMessage: error.message });
    // catch(console.log.bind(console)); // <-- this is badass
  });
}

module.exports = importConfigByOrm;