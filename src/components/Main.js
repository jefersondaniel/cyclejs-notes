import dropRepeats from 'xstream/extra/dropRepeats'
import sampleCombine from 'xstream/extra/sampleCombine'
import xs from 'xstream'
import { h } from '@cycle/dom'
import Collection from '@cycle/collection'
import isolate from '@cycle/isolate'
import dotProp from 'dot-prop-immutable-chain'
import { recordSelector } from 'orbit-state-tree'
import styles from '../styles/main.scss'
import Editor from './Editor'
import NoteItem from './NoteItem'

function EditorWrapper (sources) {
  return isolate(Editor, 'editor')(sources)
}

function NoteCollectionWrapper (sources) {
  const notes$ = sources.onion.state$
    .map(state => {
      return state.notes.map(noteId => ({
        id: noteId,
        props$: {
          id: noteId, // needed by clickProxy$
          active: state.notes.indexOf(noteId) === state.selection,
          resume: recordSelector(state.orbit, 'notes', noteId).text.substr(0, 16) || 'Empty'
        }
      }))
    })
  return Collection.gather(NoteItem, sources, notes$)
}

function view ({notesVTree$, editorVTree$}) {
  return xs.combine(
    notesVTree$,
    editorVTree$
  ).map(
    (result) => {
      const [notesVTree, editorVTree] = result

      return h('div', [
        h('main.' + styles.stack, [
          h('div.' + styles.layer1, [
            h('div.' + styles.layer2, [
              h('div.' + styles.layer3, [
                h('ul.' + styles.sidebar, [
                  ...notesVTree
                ]),
                editorVTree
              ])
            ])
          ])
        ]),
        h('ul.' + styles.toolbar, [
          h('li#addNote', [
            h('i.' + styles.iconAdd),
            'New note'
          ])
        ])
      ])
    }
  )
}

function intent ({DOM, history, Orbit, onion}, changeProxy$) {
  const notebookPathChanged$ = history
    .map(location => location.pathname.replace(/^\//, '') || null)
  const orbitStateChanged$ = Orbit.state$
  const notebookLoaded$ = Orbit.select('notebook-load').filter(request => request.completed)
  const noteCreated$ = Orbit.select('note-create').filter(request => request.completed)
  const noteRemoved$ = Orbit.select('note-remove').filter(request => request.completed)
  const noteCreateClicked$ = DOM.select('#addNote').events('click').mapTo('')
  const emptyNotebookDetected$ = onion.state$
    .filter(state => state.notes.length === 0 && state.slug && state.isLoaded)
    .map(state => state.selection)
    .compose(dropRepeats())
    .mapTo('')
  const noteCreateRequested$ = xs.merge(noteCreateClicked$, emptyNotebookDetected$)
    .compose(sampleCombine(onion.state$))
    .filter(([text, state]) => !state.isCreating && state.slug && state.isLoaded)
    .map(([text, state]) => ({text, slug: state.slug}))
  const noteChangeRequested$ = changeProxy$
    .compose(sampleCombine(onion.state$))
    .map(([text, state]) => {
      const note = recordSelector(state.orbit, 'notes', state.notes[state.selection])
      return Object.assign({}, note, {text: text})
    })
  const noteSelected$ = onion.state$
    .filter(state => state.isLoaded)
    .map(state => state.selection)
    .compose(dropRepeats())

  return {
    notebookPathChanged$,
    orbitStateChanged$,
    notebookLoaded$,
    noteCreated$,
    noteRemoved$,
    noteCreateRequested$,
    noteChangeRequested$,
    noteSelected$
  }
}

function model (actions, clickProxy$) {
  const initialReducer$ = xs.of(function initialReducer () {
    return {
      orbit: {},
      notes: [],
      editor: null,
      selection: null,
      slug: null,
      isLoaded: false,
      isCreating: false
    }
  })

  const orbitReducer$ = actions.orbitStateChanged$.map(orbitState => {
    return function (appState) {
      return dotProp(appState).set('orbit', orbitState).value()
    }
  })

  const slugReducer$ = actions.notebookPathChanged$.map(slug => {
    return function (state) {
      return dotProp(state)
        .set('slug', slug)
        .set('isLoaded', false)
        .value()
    }
  })

  const notesLoadedReducer$ = actions.notebookLoaded$.map(request => {
    return function (state) {
      const notes = request.result.notes || []
      return dotProp(state)
        .set('isLoaded', true)
        .set('notes', notes)
        .value()
    }
  })

  const isCreatingReducer$ = actions.noteCreateRequested$.mapTo(function (state) {
    return dotProp(state).set('isCreating', true).value()
  })

  const noteCreatedReducer$ = actions.noteCreated$.map(request => {
    return function (state) {
      return dotProp(state)
        .set('isCreating', false)
        .set('notes', state.notes.concat(request.result.notes))
        .value()
    }
  })

  const noteRemovedReducer$ = actions.noteRemoved$.map(request => {
    return function (state) {
      return dotProp(state)
        .set('notes', state.notes.filter(noteId => noteId != request.result.notes[0]))
        .value()
    }
  })

  const selectionReducer$ = actions.noteSelected$.mapTo(
    function (state) {
      const selection = state.selection
      return dotProp(state)
        .set(
          'editor',
          selection != null
            ? recordSelector(state.orbit, 'notes', state.notes[selection]).text
            : null
        )
        .value()
    }
  )

  const noteClickReducer$ = clickProxy$.map(note => {
    return function (state) {
      const selection = state.notes.indexOf(note.id)
      return dotProp(state)
        .set('selection', selection)
        .value()
    }
  })

  return xs.merge(
    initialReducer$,
    orbitReducer$,
    notesLoadedReducer$,
    isCreatingReducer$,
    noteCreatedReducer$,
    noteRemovedReducer$,
    slugReducer$,
    noteClickReducer$,
    selectionReducer$
  )
}

function request (actions, removeProxy$) {
  const loadCurrentNotebook$ = actions.notebookPathChanged$.filter(slug => !!slug).map(slug => ({
    method: 'findRecords',
    arguments: [
      'notes',
      {
        filter: [
          {attribute: 'slug', value: slug}
        ]
      }
    ],
    category: 'notebook-load'
  }))

  const createNote$ = actions.noteCreateRequested$.map(note => ({
    method: 'addRecord',
    arguments: ['notes', note],
    category: 'note-create'
  }))

  const changeNote$ = actions.noteChangeRequested$.map(note => ({
    method: 'replaceRecord',
    arguments: ['notes', note],
    category: 'note-change'
  }))

  const removeRecord$ = removeProxy$.map(note => ({
    method: 'removeRecord',
    arguments: ['notes', note.id],
    category: 'note-remove'
  }))

  return xs.merge(createNote$, loadCurrentNotebook$, changeNote$, removeRecord$)
}

function history (actions) {
  return actions.notebookPathChanged$.filter(slug => !slug).map(() => 'public')
}

export default function Main (sources) {
  const editor = EditorWrapper(sources)
  const notes$ = NoteCollectionWrapper(sources)
  const actions = intent(sources, editor.change$)
  const parentReducer$ = model(actions, Collection.merge(notes$, item => item.click$))
  const request$ = request(actions, Collection.merge(notes$, item => item.remove$))
  const history$ = history(actions)
  const reducer$ = xs.merge(editor.onion, parentReducer$)
  const sinks = {
    DOM: view({
      notesVTree$: Collection.pluck(notes$, item => item.DOM),
      editorVTree$: editor.DOM
    }),
    Orbit: request$,
    history: history$,
    onion: reducer$
  }
  return sinks
}
