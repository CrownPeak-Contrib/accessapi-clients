var requestify = require('requestify');
var fs = require('fs');
var log4js = require('log4js');
var util = require('util');
var keytar = require('keytar');

var log = log4js.getLogger('crownpeak-accessapi');

// if (fs.existsSync('./log4js.json')) {
//   log4js.configure('./log4js.json');
// } else if(process.env.LOG4JS_CONFIG !== undefined) {
//   //do nothing, log4js configures based on this
// } else {
//   log4js.configure({
//     appenders: [
//       { 
//         type: 'console', 
//         layout: { type: 'pattern', pattern: '%d{ABSOLUTE} %c%[%-5p%] %m%n'}
//       }
//     ]
//   })
//   //log.setLevel(log4js.levels.OFF);//default, dont show any
// }

var opts = {
  "apikey": "",
  domain: '',
  instance: '',
  username: '',
  password: ''
};

var cookies = null;

//read a json file with configuration fields, so we don't have to hard code them
if (fs.existsSync('config.json')) {
  log.info('reading config.json');
  var config = JSON.parse(fs.readFileSync('config.json', { "encoding": "utf8" }));
  instance = config.instance;
  domain = config.server;
  apikey = config.accessKey;
  username = config.username;
  if (log.isDebugEnabled) {
    log.debug('config', config);
  }
  opts = config;
}

baseURL = function (opts) {
  return 'https://' + opts.domain + '/' + opts.instance + '/cpt_webservice/accessapi';
}

//setup http headers
var options = {
  body: '',
  method: 'POST',
  headers: {
    'x-api-key': opts.apikey,
    'Content-Type': 'application/json; charset=utf8',
    //'Accept-Encoding': 'gzip, deflate '
  }
};

function checkConfig() {
  if (opts.instance === '' || opts.instance == undefined) {
    throw new Error("config not set.  use setConfig before calling api functions.");
  }
}

exports.loadConfig = function(loadOpts) {
  loadOpts = loadOpts || {};
  if (loadOpts["file"] === undefined) {
    loadOpts["file"] = "./accessapi-config.json";
  }

  var accessapiConfig = JSON.parse(fs.readFileSync(loadOpts["file"]));;

  if (Array.isArray(accessapiConfig)) {
    if (loadOpts["instance"] === undefined) {
      accessapiConfig = accessapiConfig[0];
    } else {
      var found = accessapiConfig.find(function(item,index) {
        if (item["instance"] !== undefined && item["instance"] === loadOpts["instance"]) {
          return true;
        }
      });

      if (found !== undefined) {
        accessapiConfig = found;
      }
      throw new Error(util.format("failed to find instance '{0}' declared in '{1}'.", loadOpts["instance"], loadOpts["file"]));
    }

  }

  setConfig(accessapiConfig);
  return opts;
}

exports.auth = function (callback) {
  
  return new Promise(function(resolve,reject) {

    var password = null;

    new Promise(function(resolve2,reject2) {
      if(opts.password === undefined || opts.password === '') {

        keytar.getPassword('Crownpeak-AccessAPI-NodeJS',opts["username"]+"@"+opts["instance"]).then((returnedPass) => {
          resolve2(returnedPass)
        }, (reason) => {
          console.log('fail to retrieve password');
          reject2(reason);
        })
        
      }
    }).then((password)=>{

      var body = {
        "instance": opts.instance, 
        "username": opts.username, 
        "password": password, 
        "remember_me": false, 
        "timeZoneOffsetMinutes": -480
      };

      var restPostPromise = restPost('/auth/authenticate', body, callback);
      return resolve(restPostPromise);
    
    })
  })
}

exports.logout = function (callback) {
  return restPost('/auth/logout', null, callback);
}

exports.AssetExists = function (assetIdOrPath, callback) {
  var body = {
    "assetIdOrPath" : assetIdOrPath
  };
  return restPost('/asset/Exists', body, callback);
}

exports.AssetUpdate = function (assetId, fields, fieldsToDelete, options) {
  var body = {
    "assetId" : assetId,
    "fields": fields,
    "fieldsToDelete": fieldsToDelete
  };
  
  options = options || {};
  if (options.runPostInput !== undefined)
    body["runPostInput"] = options.runPostInput;
  
  if (options.runPostSave !== undefined)
    body["runPostSave"] = options.runPostSave;
  
  return restPost('/asset/Update', body, arguments[arguments.length - 1]);
}

exports.AssetUpload = function (newName, folderId, modelId, workflowId, bytes, callback) {
  var body = {
    "newName": newName,
    "destinationFolderId": folderId,
    "modelId": modelId,
    "workflowId": workflowId,
    "bytes": bytes
  };
  if (folderId == 0 || folderId == undefined) return callback('not allowed to import to root');
  return restPost('/asset/Upload', body, callback);
}

exports.AssetCreate = function (newName, folderId, modelId, type, devTemplateLanguage, templateId, workflowId, callback) {
  var body = {
    "newName": newName,
    "destinationFolderId": folderId,
    "modelId": modelId,
    "type": type,
    "devTemplateLanguage": devTemplateLanguage,
    "templateId": templateId,
    "workflowId": workflowId
  }
  if (folderId == 0 || folderId == undefined) {
    log.fatal('create asset error, folderId=%d', folderId);
    return callback('not allowed to import to root');
  }
  return restPost('/asset/Create', body, callback);
}

exports.AssetPaged = function (AssetPagedRequest, callback) {
  var body = AssetPagedRequest || {};
  
  return restPost('/asset/Paged', body, callback);
}

exports.AssetRoute = function (AssetRouteRequest, callback) {
  var body = AssetRouteRequest || {};
  
  return restPost('/asset/Route', body, callback);
}

function setConfig(config) {
  for (var k in config) {
    opts[k] = config[k];
  }
}
exports.setConfig = setConfig;

//main http call
function restPost(url, body) {
  
  return new Promise((resolve,reject) => {

    url = baseURL(opts) + url;
    
    log.info("calling: %s", url);
    if (log.isDebugEnabled) {
      log.debug("body:", JSON.stringify(body));
      log.debug("opts:", opts);
    }

    options.body = body;
    //check if we need pass the cookies
    
    options.headers = {
      'x-api-key': opts.apikey,
      'Content-Type': 'application/json; charset=utf8',
      'Accept': 'application/json',
      //'Accept-Encoding': 'gzip, deflate '
    };

    if (cookies != null) {
      // todo: try to reuse headers from above.
      options.headers['Cookie'] = cookies
    }
    
    if (log.isDebugEnabled) log.debug('sending request', options);
    
    requestify.request(url, options).then(function (resp) {
      processCookies(resp);
      try { resp.json = JSON.parse(resp.body); } catch(ex) { }
      resolve(resp);
    }, (err) => {
      //todo: handle http 429, rate limiting busy, retry-after
      log.error('received error response:', err);
      reject(JSON.parse(err.body));
    });
    
    
    //var cbarg = arguments[arguments.length - 1];
    //if (typeof cbarg === 'function') try { return deferred.promise.nodeify(cbarg); } catch(ex) { log.warn('restPost cbarg failure: ', ex); }

  });
}

//handles cookies between http calls
function processCookies(resp, callback) {
  if (resp.headers['set-cookie'] != null) {
    log.debug('processing cookies');
    var cooks = resp.headers['set-cookie'];
    var newCookies = '';
    var cookieCount = 0;
    cooks.forEach(function (cookie) {
      var parts = cookie.split(';');
      if (cookieCount++ > 0) {
        newCookies += "; ";
      }
      newCookies += parts[0];
    });
    cookies = newCookies;
  }
}

exports.logger = log;
