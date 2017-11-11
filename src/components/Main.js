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
          id: noteId,
          active: state.notes.indexOf(noteId) === state.selection,
          resume: recordSelector(state.orbit, 'note', noteId).text.substr(0, 16) || 'Empty'
        }
      }))
    })
  return Collection.gather(NoteItem, sources, notes$)
}

function view ({notesVTree$, editorVTree$, state$}) {
  return xs.combine(
    notesVTree$,
    editorVTree$,
    state$
  ).map(
    (result) => {
      const [notesVTree, editorVTree, state] = result

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
        ]),
        !state.isLoaded ? h('div.' + styles.loaderShadow, [h('div.' + styles.loader)]) : h('div')
      ])
    }
  )
}

function intent ({DOM, history, Orbit, onion}, editorChange$) {
  const notebookPathChanged$ = history
    .map(location => location.pathname.replace(/^\//, '') || null)
  const orbitStateChanged$ = Orbit.state$
  const notebookLoaded$ = Orbit.select('notebook-load').filter(request => request.completed && !request.error)
  const noteCreated$ = Orbit.select('note-create').filter(request => request.completed && !request.error)
  const noteRemoved$ = Orbit.select('note-remove').filter(request => request.completed && !request.error)
  const noteCreateClicked$ = DOM.select('#addNote').events('click').mapTo('')
  const emptyNotebookDetected$ = notebookLoaded$
    .filter(request => !request.result.note || request.result.note.length === 0)
    .mapTo('')
  const noteCreateRequested$ = xs.merge(noteCreateClicked$, emptyNotebookDetected$)
    .compose(sampleCombine(onion.state$))
    .filter(([text, state]) => !state.isCreating && state.slug && state.isLoaded)
    .map(([text, state]) => ({text, slug: state.slug}))
  const noteChangeRequested$ = editorChange$
    .compose(sampleCombine(onion.state$))
    .map(([text, state]) => {
      const note = recordSelector(state.orbit, 'note', state.notes[state.selection])
      return Object.assign({}, note, {text: text})
    })

  return {
    notebookPathChanged$,
    orbitStateChanged$,
    notebookLoaded$,
    noteCreated$,
    noteRemoved$,
    noteCreateRequested$,
    noteChangeRequested$
  }
}

function model (actions, click$) {
  const initialReducer$ = xs.of(function initialReducer () {
    return {
      orbit: {},
      notes: [],
      errorMessage: null,
      editor: null,
      selection: null,
      slug: null,
      isLoaded: false,
      isCreating: false
    }
  })

  const updateEditor = state => dotProp(state)
    .set(
      'editor',
      state.selection != null
        ? recordSelector(state.orbit, 'note', state.notes[state.selection]).text
        : null
    )
    .value()

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
      const notes = request.result.note || []
      return updateEditor(
        dotProp(state)
          .set('isLoaded', true)
          .set('notes', notes)
          .set('selection', notes.length ? 0 : null)
          .value()
      )
    }
  })

  const isCreatingReducer$ = actions.noteCreateRequested$.mapTo(function (state) {
    return dotProp(state).set('isCreating', true).value()
  })

  const noteCreatedReducer$ = actions.noteCreated$.map(request => {
    return function (state) {
      return updateEditor(
        dotProp(state)
          .set('isCreating', false)
          .set('notes', state.notes.concat(request.result.note))
          .set('selection', state.selection === null ? state.notes.length - 1 : state.selection)
          .value()
      )
    }
  })

  const noteRemovedReducer$ = actions.noteRemoved$.map(request => {
    return function (state) {
      return updateEditor(
        dotProp(state)
          .set('notes', state.notes.filter(noteId => noteId !== request.result.note[0]))
          .set('selection', state.selection >= state.notes.length ? state.notes.length - 1 : state.selection)
          .value()
      )
    }
  })

  const noteClickReducer$ = click$.map(note => {
    return function (state) {
      const selection = state.notes.indexOf(note.id)
      return updateEditor(
        dotProp(state)
          .set('selection', selection)
          .value()
      )
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
    noteClickReducer$
  )
}

function request (actions, removeClick$) {
  const loadCurrentNotebook$ = actions.notebookPathChanged$.filter(slug => !!slug).map(slug => ({
    method: 'findRecords',
    arguments: [
      'note',
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
    arguments: ['note', note],
    category: 'note-create'
  }))

  const changeNote$ = actions.noteChangeRequested$.map(note => ({
    method: 'replaceRecord',
    arguments: ['note', note],
    category: 'note-change'
  }))

  const removeRecord$ = removeClick$.map(note => ({
    method: 'removeRecord',
    arguments: ['note', note.id],
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
      editorVTree$: editor.DOM,
      state$: sources.onion.state$
    }),
    Orbit: request$,
    history: history$,
    onion: reducer$
  }
  return sinks
}
