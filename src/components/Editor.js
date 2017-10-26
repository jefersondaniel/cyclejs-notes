import {h} from '@cycle/dom'
import styles from '../styles/main.scss'

function view (state$) {
  return state$.map(state => {
    if (state !== null) {
      return h('div.' + styles.editor, [
        h('textarea.contents', {
          props: {
            placeholder: 'Type Here',
            value: state
          }
        })
      ])
    } else {
      return h('div.' + styles.editor, ['Nothing selected'])
    }
  })
}

function intent (sources) {
  return {
    change$: sources.DOM.select('.contents').events('keyup').map(e => {
      return e.target.value
    })
  }
}

function model (actions) {
  const reducer$ = actions.change$.map(value => {
    return function () {
      return value
    }
  })

  return reducer$
}

export default function Editor (sources) {
  const actions = intent(sources)
  const sinks = {
    DOM: view(sources.onion.state$),
    change$: actions.change$,
    onion: model(actions)
  }
  return sinks
}
