[![Build Status](https://travis-ci.org/w3c/node-w3capi.svg?branch=master)](https://travis-ci.org/w3c/node-w3capi)

# node-w3capi — A JavaScript client for the W3C API

This library provides a client for the [W3C API](https://w3c.github.io/w3c-api/), which exposes information about things such as specifications, groups, users, etc.
It follows a simple pattern in which one builds up a query, and then causes the data to be fetched.

## Usage

### Server-side

The usual:

```sh
npm install node-w3capi
```

and then:

```js
var w3capi = require('node-w3capi');
w3capi.apiKey = 'deadb33f'; // Your API key.
```

### Client-side

Grab the AMD module ([`lib/w3capi.js`](https://github.com/w3c/node-w3capi/blob/master/lib/w3capi.js)) and use it, eg via [RequireJS](http://requirejs.org/):

```js
requirejs(['w3capi'], function(w3capi) {
    w3capi.apiKey = 'deadb33f'; // Your API key.
    w3capi.authMode = 'param';
});
```

## :warning: Important

the API is only available if you have an API key.
In order to obtain one, [you need to apply through your W3C account page](https://w3c.github.io/w3c-api/#apikeys).

If you wish to run the tests, you need to set an environment variable named `W3CAPIKEY` to that value, as in

```sh
W3CAPIKEY=deadb33f mocha
```

## API

This documentation does not describe the fields that the various objects have; refer to the [W3C API's documentation](https://api.w3.org/doc) for that.

Everything always starts in the same way:

You *will* need an API key. Nothing will work without it. ***NOTE***: this library does not support
keys that were created with a list of origins. You should generate a key with no list of domains.

This gives you a client instance that's immediately ready to work. You then chain some methods to
specify what you want to get, and fetch with a callback. For example:

```js
var handler = function (err, data) {
    if (err) return console.error("[ERROR]", err);
    console.log(data);
}
;

// just list all the groups
w3capi.groups()
   .fetch(handler)
;

// get the editors for a specific version of a specification
w3capi.specification("SVG11")
   .version("20030114")
   .editors
   .fetch(handler)
;
```

If you are familiar with the W3C API you know that it supports paging. This library hides that fact
and when it sees a paged list of results it *always* fetches the whole set. Typically that is a
very reasonable number of items.

### `fetch([options], cb)`

All queries end with a call to `fetch()`. You can pass `{ embed: true }` as an option if you with
for the returned value to embed some of the content from the API (this matches `?embed=true`). At
this point that is the only option. You can do without the `options` altogether.

The `cb` receives the typical `err` and `data` parameters.

### Specifications

Usage summary:

```js
w3capi.specifications().fetch()
w3capi.specification("SVG").fetch()
w3capi.specification("SVG").versions().fetch()
w3capi.specification("SVG").version("19991203").fetch()
w3capi.specification("SVG").version("19991203").deliverers().fetch()
w3capi.specification("SVG").version("19991203").editors().fetch()
w3capi.specification("SVG").version("19991203").previous().fetch()
w3capi.specification("SVG").version("19991203").next().fetch()
w3capi.specification("SVG11").latest().fetch()
w3capi.specification("SVG").superseded().fetch()
w3capi.specification("SVG11").supersedes().fetch()
```

You can list all specifications, or get a single one using its shortname. For a given specification,
you can list its versions and for a given version its editors and deliverers (the groups who shipped
it), as well as which versions were the previous or next. You can know which specification
supersedes or was superseded by which other. You can use `latest()` to get the latest version
without having to list them.

### Groups

Usage summary:

```js
w3capi.groups().fetch()
w3capi.group(54381).fetch()
w3capi.group(54381).chairs().fetch()
w3capi.group(54381).services().fetch()
w3capi.group(54381).specifications().fetch()
w3capi.group(54381).teamcontacts().fetch()
w3capi.group(54381).users().fetch()
w3capi.group(54381).charters().fetch()
w3capi.group(46884).charter(89).fetch()
w3capi.group(46884).participations().fetch()
```

You can list all groups or get a specific one by its ID (this is the same ID used in IPP, if you're
familiar with that — also the same used in ReSpec for the group). There are several sublists that
can be obtained, that are hopefully self-explanatory. The charters can be listed, and a specific
charter can be fetched given its ID (an opaque number).

### Users

Usage summary:

```js
w3capi.user("ivpki36ou94oo08osswccs80gcwogwk").fetch()
w3capi.user("ivpki36ou94oo08osswccs80gcwogwk").affiliations().fetch()
w3capi.user("ivpki36ou94oo08osswccs80gcwogwk").groups().fetch()
w3capi.user("ivpki36ou94oo08osswccs80gcwogwk").specifications().fetch()
```

Users cannot be listed, and the ID used to fetch them is an opaque identifier (not the ID used
internally in the system so as to make it harder to slurp them all in). Various sublists can be
obtained.

### Domains

Usage summary:

```js
w3capi.domains().fetch()
w3capi.domain(41481).fetch()
w3capi.domain(41481).groups().fetch()
w3capi.domain(41481).activities().fetch()
w3capi.domain(41481).services().fetch()
w3capi.domain(41481).users().fetch()
```

Domains are an organisational structure internal to the W3C, of little interest to the outside world
except to note that the Interaction Domain is the best.

### Services

Usage summary:

```js
w3capi.services(2).fetch()
w3capi.services(2).groups().fetch()
```

Services model tools that groups (or domains) can use, such as IRC, a bug tracker, a mailing list,
etc. At this point in time, the services database isn't well-maintained but it could become more
useful in future.
