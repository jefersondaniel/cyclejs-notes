import {h} from '@cycle/dom'
import sampleCombine from 'xstream/extra/sampleCombine'
import styles from '../styles/main.scss'

function view (state$) {
  return state$.map(state => {
    return h('li' + (state.active ? '.' + styles.active : ''), [
      state.resume,
      h('button.' + styles.remove, {attrs: {title: 'Remove'}}, ['x'])
    ])
  })
}

function intent ({DOM, props$}) {
  return {
    remove$: DOM.select('button').events('click'),
    click$: DOM.select('li').events('click').filter(e => e.target.tagName == 'LI')
  }
}

export default function NoteItem (sources) {
  const actions = intent(sources)
  const attachState = stream => stream
    .compose(sampleCombine(sources.props$))
    .map(([event, state]) => state)

  return {
    DOM: view(sources.props$),
    remove$: actions.remove$.compose(attachState),
    click$: actions.click$.compose(attachState)
  }
}
