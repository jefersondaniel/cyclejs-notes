module.exports = {
  use: [
    'neutrino-preset-web',
    'neutrino-middleware-sass',
    ['neutrino-middleware-html-template', {
      title: 'Notes',
      favicon: 'src/static/favicon.gif'
    }],
    neutrino => neutrino.config.module
      .rule('style')
      .use('css')
      .options({ modules: true })
  ]
}
