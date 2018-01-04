"use strict";
const dse = require('dse-driver');

const client = new dse.Client({ contactPoints: ['127.0.0.1'] });
client.connect()
  .then(function () {
    console.log('Connected, listing keyspaces:');
    for (let name in client.metadata.keyspaces) {
      if (!client.metadata.keyspaces.hasOwnProperty(name)) continue;
      const keyspace = client.metadata.keyspaces[name];
      console.log('- %s:\n\tstrategy %s\n\tstrategy options %j',
        keyspace.name, keyspace.strategy,  keyspace.strategyOptions);
    }
    return client.shutdown();
  })
  .catch(function (err) {
    console.error('There was an error when connecting', err);
    return client.shutdown();
  });