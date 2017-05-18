'use strict';

let redis = require('redis');
let request = require('request');
let _ = require('lodash');
let async = require('async');
let config = require('./config/config');
let path = require('path');
let url = require('url');
let Logger;

const LOOKUP_BATCH_SIZE = 10;
const SUMMARY_FILE_DISPLAY_LIMIT = 5;

function startup(logger) {
    Logger = logger;
}

function doLookup(entities, options, cb) {
    let searchStrings = [];
    let entitySet = new Set();
    let entityDictionary = new Map();
    let searchString = '';
    let lookupResults = [];
    let md5Count = 0;
    for (let i = 0; i < entities.length; i++) {
        let entityObj = entities[i];
        if (entityObj.isMD5) {
            if(md5Count !== 0){
                searchString += " OR ";
            }
            md5Count++;
            searchString += "md5:" + entities[i].value;
            entityDictionary.set(entities[i].value.toLowerCase(), entities[i]);
            entitySet.add(entities[i].value.toLowerCase());
            if (i % LOOKUP_BATCH_SIZE === 0 && i !== 0) {
                searchStrings.push(searchString);
                searchString = '';
            }
        }
    }

    if (searchString.length > 0) {
        searchStrings.push(searchString);
    }

    Logger.debug({searchStrings: searchStrings}, 'Search Strings');

    async.each(searchStrings, function (searchString, next) {
        _lookupHashes(searchString, entityDictionary, entitySet, options, function (err, hashResults) {
            if (err) {
                next(err);
                return;
            }

            hashResults.forEach(hashResult => {
                lookupResults.push(hashResult);
            });

            next(null);
        });
    }, function (err) {
        if (err) {
            cb(err);
        } else {
            cb(null, lookupResults);
        }
    });
}

function _lookupHashes(searchString, entityDictionary, entitySet, options, cb) {
    let results = [];
    request({
        uri: options.url + '/api/v1/binary',
        headers: {
            'X-Auth-Token': options.apiKey
        },
        qs: {
            q: searchString
        },
        method: 'GET',
        json: true,
        rejectUnauthorized: config.settings.allowInsecureConnections === true ? false : true
    }, function (err, response, body) {
        if (err) {
            Logger.error({err:err}, 'Request Error with CarbonBlack');
            cb(err);
            return;
        }

        if (response.statusCode !== 200) {
            Logger.error({response:response}, 'CarbonBlack REST Error Response Received');
            cb(body);
            return;
        }

        body.results.forEach(function (result) {
            let key = result.md5.toLowerCase();
            // Remove the MD5 from our set so that we can figure out which entities had no result
            entitySet.delete(key);
            result.CBUrl = url.resolve(options.url, '/#/binary/' + result.md5);

            results.push({
                // Required: This is the entity object passed into the integration doLookup method
                entity: entityDictionary.get(key),
                // Required: An object containing everything you want passed to the template
                data: {
                    // Required: These are the tags that are displayed in your template
                    summary: _getSummaryTags(result),
                    // Data that you want to pass back to the notification window details block
                    details: result
                }
            });
        });

        entitySet.forEach(md5WithNoResult => {
            results.push({
                entity: entityDictionary.get(md5WithNoResult),
                data: null
            });
        });

        cb(null, results);
    });
}

function _getSummaryTags(data) {
    let summaryTags = [];

    summaryTags.push(data.host_count + ' <i style="font-size: 0.9em" class="fa fa-desktop integration-text-bold-color"></i>');

    if(data.alliance_score_virustotal){
        summaryTags.push(data.alliance_score_virustotal + ' <i class="fa fa-bug integration-text-bold-color"></i>');
    }

    if(Array.isArray(data.observed_filename)){
        let numFilesToDisplay = data.observed_filename.length;
        if(data.observed_filename.length > SUMMARY_FILE_DISPLAY_LIMIT){
            numFilesToDisplay = SUMMARY_FILE_DISPLAY_LIMIT;
        }

        for(let i=0; i<numFilesToDisplay; i++){
            let filePath = data.observed_filename[i];
            let file;
            if(data.os_type === 'Windows'){
                file = path.win32.basename(filePath);
            }else{
                file = path.basename(filePath);
            }

            if(data.signed.toLowerCase() === 'unsigned'){
                summaryTags.push('<i class="fa fa-unlock integration-text-bold-color"></i> ' + file);
            }else{
                summaryTags.push('<i class="fa fa-lock integration-text-bold-color"></i> ' + file);
            }
        }
        var additionalFilesCount = data.observed_filename.length - SUMMARY_FILE_DISPLAY_LIMIT;

        if(additionalFilesCount > 0){
            summaryTags.push('+' + additionalFilesCount);
        }
    }

    return summaryTags;
}


function validateOptions(userOptions, cb) {
    let errors = [];

    if (typeof userOptions.apiKey.value !== 'string' ||
        (typeof userOptions.apiKey.value === 'string' && userOptions.apiKey.value.length === 0)) {
        errors.push({
            key: 'apiKey',
            message: 'You must provide a Carbon Black API key'
        })
    }

    if (typeof userOptions.url.value !== 'string' ||
        (typeof userOptions.url.value === 'string' && userOptions.url.value.length === 0)) {
        errors.push({
            key: 'url',
            message: 'You must provide a Carbon Black URL'
        })
    }

    cb(null, errors);
}


module.exports = {
    doLookup: doLookup,
    startup: startup,
    validateOptions: validateOptions
};