import {Schema} from '@orbit/data'
import Store from '@orbit/store'
import IndexedDBSource from '@orbit/indexeddb'

export const schema = new Schema({
  models: {
    notes: {
      attributes: {
        text: {type: 'string'},
        slug: {type: 'string'}
      }
    }
  }
})

export const store = new Store({schema})

export const backup = new IndexedDBSource({
  schema,
  name: 'backup',
  namespace: 'notes'
})
