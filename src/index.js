import {run} from '@cycle/run'
import {makeDOMDriver} from '@cycle/dom'
import {makeHashHistoryDriver} from '@cycle/history'
import onionify from 'cycle-onionify'
import {makeOrbitDriver} from './drivers/orbit-state-tree'
import {store, backup, backend, schema} from './data'
import main from './components/Main'

const drivers = {
  DOM: makeDOMDriver('#root'),
  Orbit: makeOrbitDriver({store, backup, backend, schema}),
  history: makeHashHistoryDriver()
}

const wrappedMain = onionify(main)

run(wrappedMain, drivers)
