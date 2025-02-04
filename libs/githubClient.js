'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;
var uaOUJS = require('../libs/debug').uaOUJS;

//
var _ = require("underscore");
var async = require('async');
var util = require('util');
var request = require('request');
var colors = require('ansi-colors');

var GitHubApi = require("github");
var createOAuthAppAuth = require("@octokit/auth-oauth-app").createOAuthAppAuth;

// Client
var github = new GitHubApi({
  version: "3.0.0",
  debug: (isDbg ? true : false),
  headers: {
    "User-Agent": uaOUJS + (process.env.UA_SECRET ? ' ' + process.env.UA_SECRET : '')
  }
});
module.exports = github;

// Authenticate Client
var Strategy = require('../models/strategy').Strategy;
Strategy.findOne({ name: 'github' }, async function (aErr, aStrat) {
  var auth = null;
  var appAuthentication = null;

  if (aErr)
    console.error(aErr);

  if (aStrat && process.env.DISABLE_SCRIPT_IMPORT !== 'true') {

    // TODO: Incomplete migration here
    auth = createOAuthAppAuth({
      clientType: 'oauth-app',
      clientId: aStrat.id,
      clientSecret: aStrat.key
    });

    appAuthentication = await auth({
      type: "oauth-app"
    });

    // TODO: Do something with `appAuthentication`


    // DEPRECATED: This method will break on May 5th, 2021. See #1705
    //  and importing a repo will be severely hindered with possible timeouts/failures
    github.authenticate({
      type: 'oauth',
      key: aStrat.id,
      secret: aStrat.key
    });

    // TODO: error handler for UnhandledPromiseRejectionWarning if it crops up after deprecation.
    //   Forced invalid credentials and no error thrown but doesn't mean that they won't appear.

     if (github.auth) {
       console.log(colors.green([
         'GitHub client (a.k.a this app) DOES contain authentication credentials.',
         'Higher rate limit may be available'
       ].join('\n')));
     }
     else {
       console.log(colors.red([
         'GitHub client (a.k.a this app) DOES NOT contain authentication credentials.',
         'Critical error with dependency.'
       ].join('\n')));
     }
  } else {
    console.warn(colors.yellow([
      'GitHub client (a.k.a this app) DOES NOT contain authentication credentials.',
      'Lower rate limit will be available.'
    ].join('\n')));
  }

});


// Util functions for the client.
github.usercontent = github.usercontent || {};

var githubGitDataGetBlobAsUtf8 = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      github.gitdata.getBlob(aMsg, aCallback);
    },
    function (aBlob, aCallback) {
      var content = aBlob.content;
      if (aBlob.encoding === 'base64') {
        var buf = Buffer.from(content, 'base64');
        content = buf.toString('utf8');
      }
      aCallback(null, content);
    },
  ], aCallback);
};
github.gitdata.getBlobAsUtf8 = githubGitDataGetBlobAsUtf8;

var githubUserContentBuildUrl = function (aUser, aRepo, aPath) {
  return util.format('https://raw.githubusercontent.com/%s/%s/HEAD/%s', aUser, aRepo, aPath);
};
github.usercontent.buildUrl = githubUserContentBuildUrl;

var githubUserContentGetBlobAsUtf8 = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      var url = githubUserContentBuildUrl(aMsg.user, aMsg.repo, aMsg.path);
      request.get({
        url: url,
        headers: {
          'User-Agent': uaOUJS + (process.env.UA_SECRET ? ' ' + process.env.UA_SECRET : '')
        }
      }, aCallback);
    },
    function (aResponse, aBody, aCallback) {
      if (aResponse.statusCode !== 200)
        return aCallback(util.format('Status Code %s', aResponse.statusCode));

      aCallback(null, aBody);
    },
  ], aCallback);
};

github.usercontent.getBlobAsUtf8 = githubUserContentGetBlobAsUtf8;

var githubGitDataIsJavascriptBlob = function (aBlob) {
  return (aBlob.path.match(/\.js$/) && !aBlob.path.match(/\.meta\.js$/));
};
github.gitdata.isJavascriptBlob = githubGitDataIsJavascriptBlob;

var githubGitDataGetJavascriptBlobs = function (aMsg, aCallback) {
  async.waterfall([
    function (aCallback) {
      aMsg.sha = 'HEAD';
      aMsg.recursive = true;
      github.gitdata.getTree(aMsg, aCallback);
    },
    function (aRepoTree, aCallback) {
      var entries = aRepoTree.tree;
      var blobs = _.where(entries, { type: 'blob' });
      var javascriptBlobs = _.filter(blobs, githubGitDataIsJavascriptBlob);
      aCallback(null, javascriptBlobs);
    },
  ], aCallback);
};
github.gitdata.getJavascriptBlobs = githubGitDataGetJavascriptBlobs;
