import {run} from '@cycle/run'
import {makeDOMDriver} from '@cycle/dom'
import {makeHistoryDriver} from '@cycle/history'
import onionify from 'cycle-onionify'
import {makeOrbitDriver} from './drivers/orbit-state-tree'
import {store, backup, schema} from './data'
import main from './components/Main'

const drivers = {
  DOM: makeDOMDriver('#root'),
  Orbit: makeOrbitDriver({store, backup, schema}),
  history: makeHistoryDriver()
}

const wrappedMain = onionify(main)

run(wrappedMain, drivers)
