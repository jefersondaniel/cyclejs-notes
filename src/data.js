import Orbit, { Schema, NetworkError } from '@orbit/data'
import Store from '@orbit/store'
import JSONAPISource from '@orbit/jsonapi'
import IndexedDBSource from '@orbit/indexeddb'
import Coordinator, { SyncStrategy, RequestStrategy } from '@orbit/coordinator'
import fetch from 'isomorphic-fetch'
import xs from 'xstream'
import buffer from 'xstream/extra/buffer'

Orbit.fetch = fetch

export const schema = new Schema({
  models: {
    note: {
      attributes: {
        text: {type: 'string'},
        slug: {type: 'string'}
      }
    }
  }
})

export const store = new Store({schema})

const backup = new IndexedDBSource({
  schema,
  name: 'backup',
  namespace: 'notes'
})

const remote = new JSONAPISource({
  schema,
  name: 'remote',
  host: 'https://jsonapi-notes.herokuapp.com',
  defaultFetchHeaders: {
    'Content-Type': 'application/vnd.api+json'
  }
})

export const coordinator = new Coordinator({sources: [store, backup, remote]})

const backupTransforms$ = xs.createWithMemory()

coordinator.addStrategy(new RequestStrategy({
  source: 'store',
  on: 'beforeQuery',
  target: 'backup',
  action: 'pull',
  blocking: true
}))

coordinator.addStrategy(new RequestStrategy({
  source: 'backup',
  on: 'beforePull',
  target: 'remote',
  action: query => remote.pull(query)
    .catch(error => error instanceof NetworkError ? [] : error)
    .then(transforms => transforms.map(transform => backup.push(transform))),
  blocking: true
}))

coordinator.addStrategy(new RequestStrategy({
  source: 'store',
  on: 'beforeUpdate',
  target: 'backup',
  action: 'push',
  blocking: false
}))

coordinator.addStrategy(new RequestStrategy({
  source: 'backup',
  on: 'push',
  action: transform => backupTransforms$.shamefullySendNext(transform)
}))

coordinator.addStrategy(new SyncStrategy({
  source: 'backup',
  target: 'store',
  blocking: true
}))

backupTransforms$
  .compose(buffer(xs.periodic(5000)))
  .map(transforms => {
    const uniqueTransforms = {}
    transforms.forEach(transform => {
      const uniqueId = transform.operations
        .map(op => op.op + op.record.type + op.record.id)
        .reduce((acc, actual) => acc + actual, '')
      uniqueTransforms[uniqueId] = transform
    })
    return Object.values(uniqueTransforms)
  })
  .addListener({
    next: transforms => {
      transforms.forEach(transform => remote.push(transform))
    }
  })
