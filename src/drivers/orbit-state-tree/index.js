import xs from 'xstream'
import sampleCombine from 'xstream/extra/sampleCombine'
import { adapt } from '@cycle/run/lib/adapt'
import Coordinator, { SyncStrategy } from '@orbit/coordinator'
import { StateTree, requestSelector } from 'orbit-state-tree'

export function makeOrbitDriver ({store, schema, backup}) {
  const stateTree = new StateTree({store, schema})
  const requestIdsByCategories = []
  const state$ = xs.createWithMemory()
  const request$ = xs.create()
  const listener = {
    next: message => {
      const {requestId, promise} = stateTree[message.method].apply(stateTree, message.arguments)
      if (!requestIdsByCategories[message.category]) {
        requestIdsByCategories[message.category] = []
      }
      requestIdsByCategories[message.category].push(requestId)
      promise.then(
        () => request$.shamefullySendNext({id: requestId}),
        (error) => request$.shamefullySendError({id: requestId, error: error})
      )
    }
  }
  const coordinator = new Coordinator({sources: [store, backup]})

  stateTree.onChange(state => {
    state$.shamefullySendNext(state)
  })

  coordinator.addStrategy(new SyncStrategy({
    source: 'store',
    target: 'backup'
  }))

  return function driver (sink$) {
    backup.pull(q => q.findRecords())
      .then(transform => store.sync(transform))
      .then(() => coordinator.activate())
      .then(() => sink$.addListener(listener))

    return {
      state$: adapt(state$),
      select: (category) => {
        if (!requestIdsByCategories[category]) {
          requestIdsByCategories[category] = []
        }

        return adapt(
          request$
            .filter(request => requestIdsByCategories[category].indexOf(request.id) !== -1)
            .compose(sampleCombine(state$))
            .map(([request, state]) => requestSelector(state, request.id))
        )
      }
    }
  }
}
