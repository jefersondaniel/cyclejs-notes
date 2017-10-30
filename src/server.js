const jsonApi = require('jsonapi-server')
const MongoStore = require('jsonapi-store-mongodb')

jsonApi.setConfig({
  port: process.env.PORT || 8080,
  graphiql: true
})

jsonApi.define({
  resource: 'notes',
  handlers: new MongoStore({
    url: process.env.MONGO_URL
  }),
  attributes: {
    text: jsonApi.Joi.string().allow(''),
    slug: jsonApi.Joi.string()
  }
})

jsonApi.start()
