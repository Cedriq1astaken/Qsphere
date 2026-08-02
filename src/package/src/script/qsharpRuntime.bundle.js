"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/qsharp-lang/dist/workers/adapters/browser.js
  var import_meta = {};
  var BrowserWorkerHost = class {
    constructor(url) {
      __publicField(this, "worker");
      const scriptUrl = typeof url === "string" ? new URL(url, import_meta.url).href : url.href;
      const bootstrap = `
      self.WorkerSelf = {
        postMessage(msg) { self.postMessage(msg); },
        onMessage(handler) { self.onmessage = handler; }
      };
      importScripts("${scriptUrl}");
    `;
      const blob = new Blob([bootstrap], { type: "application/javascript" });
      this.worker = new Worker(URL.createObjectURL(blob));
    }
    postMessage(msg) {
      this.worker.postMessage(msg);
    }
    onMessage(handler) {
      this.worker.onmessage = handler;
    }
    onError(handler) {
      this.worker.onerror = handler;
    }
    terminate() {
      this.worker.terminate();
    }
  };

  // node_modules/qsharp-lang/lib/web/qsc_wasm.js
  var qsc_wasm_exports = {};
  __export(qsc_wasm_exports, {
    DebugService: () => DebugService,
    LanguageService: () => LanguageService,
    ProjectLoader: () => ProjectLoader,
    StepResultId: () => StepResultId,
    check_exercise_solution: () => check_exercise_solution,
    default: () => __wbg_init,
    generate_docs: () => generate_docs,
    get_ast: () => get_ast,
    get_circuit: () => get_circuit,
    get_estimates: () => get_estimates,
    get_hir: () => get_hir,
    get_library_source_content: () => get_library_source_content,
    get_library_summaries: () => get_library_summaries,
    get_qir: () => get_qir,
    get_rir: () => get_rir,
    get_target_profile_from_entry_point: () => get_target_profile_from_entry_point,
    git_hash: () => git_hash,
    initLogging: () => initLogging,
    initSync: () => initSync,
    run: () => run,
    runWithNoise: () => runWithNoise,
    setLogLevel: () => setLogLevel
  });
  var import_meta2 = {};
  var DebugService = class {
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      DebugServiceFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_debugservice_free(ptr, 0);
    }
    /**
     * @returns {IQuantumStateList}
     */
    capture_quantum_state() {
      const ret = wasm.debugservice_capture_quantum_state(this.__wbg_ptr);
      return takeObject(ret);
    }
    /**
     * @param {Function} event_cb
     * @param {Uint32Array} ids
     * @returns {IStructStepResult}
     */
    eval_continue(event_cb, ids) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.debugservice_eval_continue(retptr, this.__wbg_ptr, addBorrowedObject(event_cb), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        heap[stack_pointer++] = void 0;
      }
    }
    /**
     * @param {Function} event_cb
     * @param {Uint32Array} ids
     * @returns {IStructStepResult}
     */
    eval_next(event_cb, ids) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.debugservice_eval_next(retptr, this.__wbg_ptr, addBorrowedObject(event_cb), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        heap[stack_pointer++] = void 0;
      }
    }
    /**
     * @param {Function} event_cb
     * @param {Uint32Array} ids
     * @returns {IStructStepResult}
     */
    eval_step_in(event_cb, ids) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.debugservice_eval_step_in(retptr, this.__wbg_ptr, addBorrowedObject(event_cb), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        heap[stack_pointer++] = void 0;
      }
    }
    /**
     * @param {Function} event_cb
     * @param {Uint32Array} ids
     * @returns {IStructStepResult}
     */
    eval_step_out(event_cb, ids) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(ids, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.debugservice_eval_step_out(retptr, this.__wbg_ptr, addBorrowedObject(event_cb), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        heap[stack_pointer++] = void 0;
      }
    }
    /**
     * @param {string} path
     * @returns {IBreakpointSpanList}
     */
    get_breakpoints(path) {
      const ptr0 = passStringToWasm0(path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.debugservice_get_breakpoints(this.__wbg_ptr, ptr0, len0);
      return takeObject(ret);
    }
    /**
     * @returns {any}
     */
    get_circuit() {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.debugservice_get_circuit(retptr, this.__wbg_ptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
          throw takeObject(r1);
        }
        return takeObject(r0);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
     * @param {number} frame_id
     * @returns {IVariableList}
     */
    get_locals(frame_id) {
      const ret = wasm.debugservice_get_locals(this.__wbg_ptr, frame_id);
      return takeObject(ret);
    }
    /**
     * @returns {IStackFrameList}
     */
    get_stack_frames() {
      const ret = wasm.debugservice_get_stack_frames(this.__wbg_ptr);
      return takeObject(ret);
    }
    /**
     * @param {IProgramConfig} program
     * @param {string | null} [entry]
     * @returns {string}
     */
    load_program(program, entry) {
      let deferred2_0;
      let deferred2_1;
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        var ptr0 = isLikeNone(entry) ? 0 : passStringToWasm0(entry, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len0 = WASM_VECTOR_LEN;
        wasm.debugservice_load_program(retptr, this.__wbg_ptr, addHeapObject(program), ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred2_0 = r0;
        deferred2_1 = r1;
        return getStringFromWasm0(r0, r1);
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
      }
    }
    constructor() {
      const ret = wasm.debugservice_new();
      this.__wbg_ptr = ret >>> 0;
      DebugServiceFinalization.register(this, this.__wbg_ptr, this);
      return this;
    }
  };
  if (Symbol.dispose) DebugService.prototype[Symbol.dispose] = DebugService.prototype.free;
  var LanguageService = class {
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      LanguageServiceFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_languageservice_free(ptr, 0);
    }
    /**
     * @param {string} uri
     * @param {string} language_id
     */
    close_document(uri, language_id) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(language_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      wasm.languageservice_close_document(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {string} notebook_uri
     */
    close_notebook_document(notebook_uri) {
      const ptr0 = passStringToWasm0(notebook_uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.languageservice_close_notebook_document(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {string} uri
     * @param {IRange} range
     * @returns {ICodeAction[]}
     */
    get_code_actions(uri, range) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.languageservice_get_code_actions(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(range));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v2;
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
     * @param {string} uri
     * @returns {ICodeLens[]}
     */
    get_code_lenses(uri) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.languageservice_get_code_lenses(retptr, this.__wbg_ptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v2;
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @returns {ICompletionList}
     */
    get_completions(uri, position) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_get_completions(this.__wbg_ptr, ptr0, len0, addHeapObject(position));
      return takeObject(ret);
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @returns {ILocation | undefined}
     */
    get_definition(uri, position) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_get_definition(this.__wbg_ptr, ptr0, len0, addHeapObject(position));
      return takeObject(ret);
    }
    /**
     * @param {string} uri
     * @returns {ITextEdit[]}
     */
    get_format_changes(uri) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.languageservice_get_format_changes(retptr, this.__wbg_ptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v2;
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @returns {IHover | undefined}
     */
    get_hover(uri, position) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_get_hover(this.__wbg_ptr, ptr0, len0, addHeapObject(position));
      return takeObject(ret);
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @param {boolean} include_declaration
     * @returns {ILocation[]}
     */
    get_references(uri, position, include_declaration) {
      try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.languageservice_get_references(retptr, this.__wbg_ptr, ptr0, len0, addHeapObject(position), include_declaration);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayJsValueFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 4, 4);
        return v2;
      } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
      }
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @param {string} new_name
     * @returns {IWorkspaceEdit}
     */
    get_rename(uri, position, new_name) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(new_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_get_rename(this.__wbg_ptr, ptr0, len0, addHeapObject(position), ptr1, len1);
      return takeObject(ret);
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @returns {ISignatureHelp | undefined}
     */
    get_signature_help(uri, position) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_get_signature_help(this.__wbg_ptr, ptr0, len0, addHeapObject(position));
      return takeObject(ret);
    }
    constructor() {
      const ret = wasm.languageservice_new();
      this.__wbg_ptr = ret >>> 0;
      LanguageServiceFinalization.register(this, this.__wbg_ptr, this);
      return this;
    }
    /**
     * @param {string} uri
     * @param {IPosition} position
     * @returns {ITextEdit | undefined}
     */
    prepare_rename(uri, position) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.languageservice_prepare_rename(this.__wbg_ptr, ptr0, len0, addHeapObject(position));
      return takeObject(ret);
    }
    /**
     * @param {(uri: string, version: number | undefined, diagnostics: VSDiagnostic[]) => void} diagnostics_callback
     * @param {(callables: ITestDescriptor[]) => void} test_callables_callback
     * @param {IProjectHost} host
     * @returns {Promise<any>}
     */
    start_update_loop(diagnostics_callback, test_callables_callback, host) {
      try {
        const ret = wasm.languageservice_start_update_loop(this.__wbg_ptr, addBorrowedObject(diagnostics_callback), addBorrowedObject(test_callables_callback), addHeapObject(host));
        return takeObject(ret);
      } finally {
        heap[stack_pointer++] = void 0;
        heap[stack_pointer++] = void 0;
      }
    }
    stop_update_loop() {
      wasm.languageservice_stop_update_loop(this.__wbg_ptr);
    }
    /**
     * @param {IWorkspaceConfiguration} config
     */
    update_configuration(config) {
      wasm.languageservice_update_configuration(this.__wbg_ptr, addHeapObject(config));
    }
    /**
     * @param {string} uri
     * @param {number} version
     * @param {string} text
     * @param {string} language_id
     */
    update_document(uri, version, text, language_id) {
      const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(text, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      const ptr2 = passStringToWasm0(language_id, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len2 = WASM_VECTOR_LEN;
      wasm.languageservice_update_document(this.__wbg_ptr, ptr0, len0, version, ptr1, len1, ptr2, len2);
    }
    /**
     * @param {string} notebook_uri
     * @param {INotebookMetadata} notebook_metadata
     * @param {ICell[]} cells
     */
    update_notebook_document(notebook_uri, notebook_metadata, cells) {
      const ptr0 = passStringToWasm0(notebook_uri, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passArrayJsValueToWasm0(cells, wasm.__wbindgen_export);
      const len1 = WASM_VECTOR_LEN;
      wasm.languageservice_update_notebook_document(this.__wbg_ptr, ptr0, len0, addHeapObject(notebook_metadata), ptr1, len1);
    }
  };
  if (Symbol.dispose) LanguageService.prototype[Symbol.dispose] = LanguageService.prototype.free;
  var ProjectLoader = class {
    __destroy_into_raw() {
      const ptr = this.__wbg_ptr;
      this.__wbg_ptr = 0;
      ProjectLoaderFinalization.unregister(this);
      return ptr;
    }
    free() {
      const ptr = this.__destroy_into_raw();
      wasm.__wbg_projectloader_free(ptr, 0);
    }
    /**
     * @param {string} file_path
     * @param {string | null} [source]
     * @returns {Promise<IProjectConfig>}
     */
    load_openqasm_project(file_path, source) {
      const ptr0 = passStringToWasm0(file_path, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      var ptr1 = isLikeNone(source) ? 0 : passStringToWasm0(source, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      var len1 = WASM_VECTOR_LEN;
      const ret = wasm.projectloader_load_openqasm_project(this.__wbg_ptr, ptr0, len0, ptr1, len1);
      return takeObject(ret);
    }
    /**
     * @param {string} directory
     * @returns {Promise<IProjectConfig>}
     */
    load_project_with_deps(directory) {
      const ptr0 = passStringToWasm0(directory, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.projectloader_load_project_with_deps(this.__wbg_ptr, ptr0, len0);
      return takeObject(ret);
    }
    /**
     * @param {IProjectHost} project_host
     */
    constructor(project_host) {
      const ret = wasm.projectloader_new(addHeapObject(project_host));
      this.__wbg_ptr = ret >>> 0;
      ProjectLoaderFinalization.register(this, this.__wbg_ptr, this);
      return this;
    }
  };
  if (Symbol.dispose) ProjectLoader.prototype[Symbol.dispose] = ProjectLoader.prototype.free;
  var StepResultId = Object.freeze({
    BreakpointHit: 0,
    "0": "BreakpointHit",
    Next: 1,
    "1": "Next",
    StepIn: 2,
    "2": "StepIn",
    StepOut: 3,
    "3": "StepOut",
    Return: 4,
    "4": "Return",
    Fail: 5,
    "5": "Fail"
  });
  function check_exercise_solution(solution_code, exercise_sources_js, event_cb) {
    try {
      const ptr0 = passStringToWasm0(solution_code, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ret = wasm.check_exercise_solution(ptr0, len0, addHeapObject(exercise_sources_js), addBorrowedObject(event_cb));
      return ret !== 0;
    } finally {
      heap[stack_pointer++] = void 0;
    }
  }
  function generate_docs(additional_program) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.generate_docs(retptr, isLikeNone(additional_program) ? 0 : addHeapObject(additional_program));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
      wasm.__wbindgen_export4(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function get_ast(program) {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_ast(retptr, addHeapObject(program));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
  function get_circuit(program, operation, config) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_circuit(retptr, addHeapObject(program), isLikeNone(operation) ? 0 : addHeapObject(operation), addHeapObject(config));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function get_estimates(program, expr, params) {
    let deferred4_0;
    let deferred4_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(expr, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(params, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      wasm.get_estimates(retptr, addHeapObject(program), ptr0, len0, ptr1, len1);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr3 = r0;
      var len3 = r1;
      if (r3) {
        ptr3 = 0;
        len3 = 0;
        throw takeObject(r2);
      }
      deferred4_0 = ptr3;
      deferred4_1 = len3;
      return getStringFromWasm0(ptr3, len3);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred4_0, deferred4_1, 1);
    }
  }
  function get_hir(program) {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_hir(retptr, addHeapObject(program));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
  function get_library_source_content(name) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.get_library_source_content(retptr, ptr0, len0);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      let v2;
      if (r0 !== 0) {
        v2 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
      }
      return v2;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function get_library_summaries() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_library_summaries(retptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
  function get_qir(program) {
    let deferred2_0;
    let deferred2_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_qir(retptr, addHeapObject(program));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      var ptr1 = r0;
      var len1 = r1;
      if (r3) {
        ptr1 = 0;
        len1 = 0;
        throw takeObject(r2);
      }
      deferred2_0 = ptr1;
      deferred2_1 = len1;
      return getStringFromWasm0(ptr1, len1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred2_0, deferred2_1, 1);
    }
  }
  function get_rir(program) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.get_rir(retptr, addHeapObject(program));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
      if (r3) {
        throw takeObject(r2);
      }
      var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
      wasm.__wbindgen_export4(r0, r1 * 4, 4);
      return v1;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function get_target_profile_from_entry_point(file_name, source) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(file_name, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(source, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len1 = WASM_VECTOR_LEN;
      wasm.get_target_profile_from_entry_point(retptr, ptr0, len0, ptr1, len1);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      let v3;
      if (r0 !== 0) {
        v3 = getStringFromWasm0(r0, r1).slice();
        wasm.__wbindgen_export4(r0, r1 * 1, 1);
      }
      return v3;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function git_hash() {
    let deferred1_0;
    let deferred1_1;
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.git_hash(retptr);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      deferred1_0 = r0;
      deferred1_1 = r1;
      return getStringFromWasm0(r0, r1);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      wasm.__wbindgen_export4(deferred1_0, deferred1_1, 1);
    }
  }
  function initLogging(callback, level) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.initLogging(retptr, addHeapObject(callback), level);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function run(program, expr, event_cb, shots) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(expr, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.run(retptr, addHeapObject(program), ptr0, len0, addBorrowedObject(event_cb), shots);
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return r0 !== 0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      heap[stack_pointer++] = void 0;
    }
  }
  function runWithNoise(program, expr, event_cb, shots, pauliNoise, qubitLoss) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(expr, wasm.__wbindgen_export, wasm.__wbindgen_export2);
      const len0 = WASM_VECTOR_LEN;
      wasm.runWithNoise(retptr, addHeapObject(program), ptr0, len0, addBorrowedObject(event_cb), shots, addBorrowedObject(pauliNoise), addBorrowedObject(qubitLoss));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
      if (r2) {
        throw takeObject(r1);
      }
      return r0 !== 0;
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
      heap[stack_pointer++] = void 0;
      heap[stack_pointer++] = void 0;
      heap[stack_pointer++] = void 0;
    }
  }
  function setLogLevel(level) {
    wasm.setLogLevel(level);
  }
  function __wbg_get_imports() {
    const import0 = {
      __proto__: null,
      __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
        const ret = Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
      },
      __wbg_Number_a5a435bd7bbec835: function(arg0) {
        const ret = Number(getObject(arg0));
        return ret;
      },
      __wbg_String_8564e559799eccda: function(arg0, arg1) {
        const ret = String(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg___wbindgen_bigint_get_as_i64_447a76b5c6ef7bda: function(arg0, arg1) {
        const v = getObject(arg1);
        const ret = typeof v === "bigint" ? v : void 0;
        getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
      },
      __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function(arg0) {
        const v = getObject(arg0);
        const ret = typeof v === "boolean" ? v : void 0;
        return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
      },
      __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(arg0, arg1) {
        const ret = debugString(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg___wbindgen_in_41dbb8413020e076: function(arg0, arg1) {
        const ret = getObject(arg0) in getObject(arg1);
        return ret;
      },
      __wbg___wbindgen_is_bigint_e2141d4f045b7eda: function(arg0) {
        const ret = typeof getObject(arg0) === "bigint";
        return ret;
      },
      __wbg___wbindgen_is_function_3c846841762788c1: function(arg0) {
        const ret = typeof getObject(arg0) === "function";
        return ret;
      },
      __wbg___wbindgen_is_object_781bc9f159099513: function(arg0) {
        const val = getObject(arg0);
        const ret = typeof val === "object" && val !== null;
        return ret;
      },
      __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
        const ret = typeof getObject(arg0) === "string";
        return ret;
      },
      __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(arg0) {
        const ret = getObject(arg0) === void 0;
        return ret;
      },
      __wbg___wbindgen_jsval_eq_ee31bfad3e536463: function(arg0, arg1) {
        const ret = getObject(arg0) === getObject(arg1);
        return ret;
      },
      __wbg___wbindgen_jsval_loose_eq_5bcc3bed3c69e72b: function(arg0, arg1) {
        const ret = getObject(arg0) == getObject(arg1);
        return ret;
      },
      __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof obj === "number" ? obj : void 0;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
      },
      __wbg___wbindgen_string_get_395e606bd0ee4427: function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof obj === "string" ? obj : void 0;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
      },
      __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(arg0) {
        getObject(arg0)._wbg_cb_unref();
      },
      __wbg_call_2d781c1f4d5c0ef8: function() {
        return handleError(function(arg0, arg1, arg2) {
          const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_call_e133b57c9155d22c: function() {
        return handleError(function(arg0, arg1) {
          const ret = getObject(arg0).call(getObject(arg1));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_call_f858478a02f9600f: function() {
        return handleError(function(arg0, arg1, arg2, arg3, arg4) {
          const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_done_08ce71ee07e3bd17: function(arg0) {
        const ret = getObject(arg0).done;
        return ret;
      },
      __wbg_entries_e8a20ff8c9757101: function(arg0) {
        const ret = Object.entries(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_fetchGithub_07b18f4c1d353ded: function() {
        return handleError(function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
          const ret = getObject(arg0).fetchGithub(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4), getStringFromWasm0(arg5, arg6), getStringFromWasm0(arg7, arg8));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_findManifestDirectory_033c7b5017798748: function(arg0, arg1, arg2) {
        const ret = getObject(arg0).findManifestDirectory(getStringFromWasm0(arg1, arg2));
        return addHeapObject(ret);
      },
      __wbg_from_4bdf88943703fd48: function(arg0) {
        const ret = Array.from(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_getRandomValues_76dfc69825c9c552: function() {
        return handleError(function(arg0, arg1) {
          globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments);
      },
      __wbg_get_326e41e095fb2575: function() {
        return handleError(function(arg0, arg1) {
          const ret = Reflect.get(getObject(arg0), getObject(arg1));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_get_a8ee5c45dabc1b3b: function(arg0, arg1) {
        const ret = getObject(arg0)[arg1 >>> 0];
        return addHeapObject(ret);
      },
      __wbg_get_stack_trace_limit_19dd44bb32fdd0bb: function() {
        const ret = Error.stackTraceLimit;
        return isLikeNone(ret) ? 4294967297 : ret >>> 0;
      },
      __wbg_get_unchecked_329cfe50afab7352: function(arg0, arg1) {
        const ret = getObject(arg0)[arg1 >>> 0];
        return addHeapObject(ret);
      },
      __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
        const ret = getObject(arg0)[getObject(arg1)];
        return addHeapObject(ret);
      },
      __wbg_instanceof_ArrayBuffer_101e2bf31071a9f6: function(arg0) {
        let result;
        try {
          result = getObject(arg0) instanceof ArrayBuffer;
        } catch (_) {
          result = false;
        }
        const ret = result;
        return ret;
      },
      __wbg_instanceof_Error_4691a5b466e32a80: function(arg0) {
        let result;
        try {
          result = getObject(arg0) instanceof Error;
        } catch (_) {
          result = false;
        }
        const ret = result;
        return ret;
      },
      __wbg_instanceof_Map_f194b366846aca0c: function(arg0) {
        let result;
        try {
          result = getObject(arg0) instanceof Map;
        } catch (_) {
          result = false;
        }
        const ret = result;
        return ret;
      },
      __wbg_instanceof_Uint8Array_740438561a5b956d: function(arg0) {
        let result;
        try {
          result = getObject(arg0) instanceof Uint8Array;
        } catch (_) {
          result = false;
        }
        const ret = result;
        return ret;
      },
      __wbg_isArray_33b91feb269ff46e: function(arg0) {
        const ret = Array.isArray(getObject(arg0));
        return ret;
      },
      __wbg_isArray_42f3245bcac28e65: function(arg0) {
        const ret = Array.isArray(getObject(arg0));
        return ret;
      },
      __wbg_isSafeInteger_ecd6a7f9c3e053cd: function(arg0) {
        const ret = Number.isSafeInteger(getObject(arg0));
        return ret;
      },
      __wbg_iterator_d8f549ec8fb061b1: function() {
        const ret = Symbol.iterator;
        return addHeapObject(ret);
      },
      __wbg_length_b3416cf66a5452c8: function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
      },
      __wbg_length_ea16607d7b61445b: function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
      },
      __wbg_listDirectory_3abb3a7342129e7c: function(arg0, arg1, arg2) {
        const ret = getObject(arg0).listDirectory(getStringFromWasm0(arg1, arg2));
        return addHeapObject(ret);
      },
      __wbg_message_00d63f20c41713dd: function(arg0) {
        const ret = getObject(arg0).message;
        return addHeapObject(ret);
      },
      __wbg_new_49af1fa01cd4d19b: function() {
        const ret = new Error();
        return addHeapObject(ret);
      },
      __wbg_new_49d5571bd3f0c4d4: function() {
        const ret = /* @__PURE__ */ new Map();
        return addHeapObject(ret);
      },
      __wbg_new_5f486cdf45a04d78: function(arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_new_a70fbab9066b301f: function() {
        const ret = new Array();
        return addHeapObject(ret);
      },
      __wbg_new_ab79df5bd7c26067: function() {
        const ret = new Object();
        return addHeapObject(ret);
      },
      __wbg_new_typed_aaaeaf29cf802876: function(arg0, arg1) {
        try {
          var state0 = { a: arg0, b: arg1 };
          var cb0 = (arg02, arg12) => {
            const a = state0.a;
            state0.a = 0;
            try {
              return __wasm_bindgen_func_elem_8840(a, state0.b, arg02, arg12);
            } finally {
              state0.a = a;
            }
          };
          const ret = new Promise(cb0);
          return addHeapObject(ret);
        } finally {
          state0.a = state0.b = 0;
        }
      },
      __wbg_next_11b99ee6237339e3: function() {
        return handleError(function(arg0) {
          const ret = getObject(arg0).next();
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_next_e01a967809d1aa68: function(arg0) {
        const ret = getObject(arg0).next;
        return addHeapObject(ret);
      },
      __wbg_packageGraphSources_41adf6632e94af6f: function(arg0) {
        const ret = getObject(arg0).packageGraphSources;
        return addHeapObject(ret);
      },
      __wbg_profile_edbf563ae3d57e6d: function(arg0, arg1) {
        const ret = getObject(arg1).profile;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg_projectType_3d7f26604be90e3c: function(arg0, arg1) {
        const ret = getObject(arg1).projectType;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg_prototypesetcall_d62e5099504357e6: function(arg0, arg1, arg2) {
        Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
      },
      __wbg_queueMicrotask_0c399741342fb10f: function(arg0) {
        const ret = getObject(arg0).queueMicrotask;
        return addHeapObject(ret);
      },
      __wbg_queueMicrotask_a082d78ce798393e: function(arg0) {
        queueMicrotask(getObject(arg0));
      },
      __wbg_readFile_5cf1797fcdea6a2c: function() {
        return handleError(function(arg0, arg1, arg2) {
          const ret = getObject(arg0).readFile(getStringFromWasm0(arg1, arg2));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_resolvePath_6e40d08df0c5e326: function() {
        return handleError(function(arg0, arg1, arg2, arg3, arg4) {
          const ret = getObject(arg0).resolvePath(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
          return addHeapObject(ret);
        }, arguments);
      },
      __wbg_resolve_ae8d83246e5bcc12: function(arg0) {
        const ret = Promise.resolve(getObject(arg0));
        return addHeapObject(ret);
      },
      __wbg_set_282384002438957f: function(arg0, arg1, arg2) {
        getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
      },
      __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
        getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
      },
      __wbg_set_bf7251625df30a02: function(arg0, arg1, arg2) {
        const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
      },
      __wbg_set_stack_trace_limit_a6b4f5c23511a229: function(arg0) {
        Error.stackTraceLimit = arg0 >>> 0;
      },
      __wbg_stack_948d41d68c41fac5: function(arg0, arg1) {
        const ret = getObject(arg1).stack;
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
      },
      __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
        const ret = typeof global === "undefined" ? null : global;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
      },
      __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
        const ret = typeof globalThis === "undefined" ? null : globalThis;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
      },
      __wbg_static_accessor_SELF_f207c857566db248: function() {
        const ret = typeof self === "undefined" ? null : self;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
      },
      __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
        const ret = typeof window === "undefined" ? null : window;
        return isLikeNone(ret) ? 0 : addHeapObject(ret);
      },
      __wbg_then_098abe61755d12f6: function(arg0, arg1) {
        const ret = getObject(arg0).then(getObject(arg1));
        return addHeapObject(ret);
      },
      __wbg_then_9e335f6dd892bc11: function(arg0, arg1, arg2) {
        const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
        return addHeapObject(ret);
      },
      __wbg_value_21fc78aab0322612: function(arg0) {
        const ret = getObject(arg0).value;
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000001: function(arg0, arg1) {
        const ret = makeMutClosure(arg0, arg1, wasm.__wasm_bindgen_func_elem_8468, __wasm_bindgen_func_elem_8469);
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000002: function(arg0) {
        const ret = arg0;
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000003: function(arg0) {
        const ret = arg0;
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000004: function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
      },
      __wbindgen_cast_0000000000000005: function(arg0) {
        const ret = BigInt.asUintN(64, arg0);
        return addHeapObject(ret);
      },
      __wbindgen_object_clone_ref: function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
      },
      __wbindgen_object_drop_ref: function(arg0) {
        takeObject(arg0);
      }
    };
    return {
      __proto__: null,
      "./qsc_wasm_bg.js": import0
    };
  }
  function __wasm_bindgen_func_elem_8469(arg0, arg1, arg2) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.__wasm_bindgen_func_elem_8469(retptr, arg0, arg1, addHeapObject(arg2));
      var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
      var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
      if (r1) {
        throw takeObject(r0);
      }
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  function __wasm_bindgen_func_elem_8840(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_8840(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
  }
  var DebugServiceFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((ptr) => wasm.__wbg_debugservice_free(ptr >>> 0, 1));
  var LanguageServiceFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((ptr) => wasm.__wbg_languageservice_free(ptr >>> 0, 1));
  var ProjectLoaderFinalization = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((ptr) => wasm.__wbg_projectloader_free(ptr >>> 0, 1));
  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }
  function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error("out of js stack");
    heap[--stack_pointer] = obj;
    return stack_pointer;
  }
  var CLOSURE_DTORS = typeof FinalizationRegistry === "undefined" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((state) => state.dtor(state.a, state.b));
  function debugString(val) {
    const type = typeof val;
    if (type == "number" || type == "boolean" || val == null) {
      return `${val}`;
    }
    if (type == "string") {
      return `"${val}"`;
    }
    if (type == "symbol") {
      const description = val.description;
      if (description == null) {
        return "Symbol";
      } else {
        return `Symbol(${description})`;
      }
    }
    if (type == "function") {
      const name = val.name;
      if (typeof name == "string" && name.length > 0) {
        return `Function(${name})`;
      } else {
        return "Function";
      }
    }
    if (Array.isArray(val)) {
      const length = val.length;
      let debug = "[";
      if (length > 0) {
        debug += debugString(val[0]);
      }
      for (let i = 1; i < length; i++) {
        debug += ", " + debugString(val[i]);
      }
      debug += "]";
      return debug;
    }
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
      className = builtInMatches[1];
    } else {
      return toString.call(val);
    }
    if (className == "Object") {
      try {
        return "Object(" + JSON.stringify(val) + ")";
      } catch (_) {
        return "Object";
      }
    }
    if (val instanceof Error) {
      return `${val.name}: ${val.message}
${val.stack}`;
    }
    return className;
  }
  function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }
  function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
      result.push(takeObject(mem.getUint32(i, true)));
    }
    return result;
  }
  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }
  var cachedDataViewMemory0 = null;
  function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
      cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
  }
  function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
  }
  var cachedUint32ArrayMemory0 = null;
  function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
      cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
  }
  var cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }
  function getObject(idx) {
    return heap[idx];
  }
  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      wasm.__wbindgen_export3(addHeapObject(e));
    }
  }
  var heap = new Array(1024).fill(void 0);
  heap.push(void 0, null, true, false);
  var heap_next = heap.length;
  function isLikeNone(x) {
    return x === void 0 || x === null;
  }
  function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
      state.cnt++;
      const a = state.a;
      state.a = 0;
      try {
        return f(a, state.b, ...args);
      } finally {
        state.a = a;
        real._wbg_cb_unref();
      }
    };
    real._wbg_cb_unref = () => {
      if (--state.cnt === 0) {
        state.dtor(state.a, state.b);
        state.a = 0;
        CLOSURE_DTORS.unregister(state);
      }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
  }
  function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }
  function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
      mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
  }
  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === void 0) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr2 = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr2, ptr2 + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr2;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 127) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }
  var stack_pointer = 1024;
  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }
  var cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  var MAX_SAFARI_DECODE_BYTES = 2146435072;
  var numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
      cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }
  var cachedTextEncoder = new TextEncoder();
  if (!("encodeInto" in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function(arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    };
  }
  var WASM_VECTOR_LEN = 0;
  var wasmModule;
  var wasm;
  function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
  }
  async function __wbg_load(module, imports) {
    if (typeof Response === "function" && module instanceof Response) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          const validResponse = module.ok && expectedResponseType(module.type);
          if (validResponse && module.headers.get("Content-Type") !== "application/wasm") {
            console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);
          } else {
            throw e;
          }
        }
      }
      const bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      const instance = await WebAssembly.instantiate(module, imports);
      if (instance instanceof WebAssembly.Instance) {
        return { instance, module };
      } else {
        return instance;
      }
    }
    function expectedResponseType(type) {
      switch (type) {
        case "basic":
        case "cors":
        case "default":
          return true;
      }
      return false;
    }
  }
  function initSync(module) {
    if (wasm !== void 0) return wasm;
    if (module !== void 0) {
      if (Object.getPrototypeOf(module) === Object.prototype) {
        ({ module } = module);
      } else {
        console.warn("using deprecated parameters for `initSync()`; pass a single object instead");
      }
    }
    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
      module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
  }
  async function __wbg_init(module_or_path) {
    if (wasm !== void 0) return wasm;
    if (module_or_path !== void 0) {
      if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
        ({ module_or_path } = module_or_path);
      } else {
        console.warn("using deprecated parameters for the initialization function; pass a single object instead");
      }
    }
    if (module_or_path === void 0) {
      module_or_path = new URL("qsc_wasm_bg.wasm", import_meta2.url);
    }
    const imports = __wbg_get_imports();
    if (typeof module_or_path === "string" || typeof Request === "function" && module_or_path instanceof Request || typeof URL === "function" && module_or_path instanceof URL) {
      module_or_path = fetch(module_or_path);
    }
    const { instance, module } = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module);
  }

  // node_modules/qsharp-lang/dist/data-structures/register.js
  var RegisterType;
  (function(RegisterType2) {
    RegisterType2[RegisterType2["Qubit"] = 0] = "Qubit";
    RegisterType2[RegisterType2["Classical"] = 1] = "Classical";
  })(RegisterType || (RegisterType = {}));

  // node_modules/qsharp-lang/dist/data-structures/circuit.js
  var CURRENT_VERSION = 1;

  // node_modules/qsharp-lang/dist/log.js
  var telemetryCollector = null;
  var levels = ["off", "error", "warn", "info", "debug", "trace"];
  var logLevel = 0;
  var log = {
    setLogLevel(level) {
      if (typeof level === "string") {
        const lowerLevel = level.toLowerCase();
        let newLevel = 0;
        levels.forEach((name, idx) => {
          if (name === lowerLevel)
            newLevel = idx;
        });
        logLevel = newLevel;
      } else {
        logLevel = level;
      }
      this.onLevelChanged?.(logLevel);
    },
    onLevelChanged: null,
    getLogLevel() {
      return logLevel;
    },
    error(...args) {
      if (logLevel >= 1)
        console.error(...args);
    },
    warn(...args) {
      if (logLevel >= 2)
        console.warn(...args);
    },
    info(...args) {
      if (logLevel >= 3)
        console.info(...args);
    },
    debug(...args) {
      if (logLevel >= 4)
        console.debug(...args);
    },
    trace(...args) {
      if (logLevel >= 5)
        console.debug(...args);
    },
    never(val) {
      log.error("Exhaustive type checking didn't account for: %o", val);
    },
    /**
     * @param level - A number indicating severity: 1 = Error, 2 = Warn, 3 = Info, 4 = Debug, 5 = Trace
     * @param target - The area or component sending the message, e.g. "parser" (useful for filtering)
     * @param args - The format string and args to log, e.g. ["Index of %s is %i", str, index]
     */
    logWithLevel(level, target, ...args) {
      const [firstArg, ...trailingArgs] = args;
      const outArgs = [`[${target || ""}] ${firstArg}`, ...trailingArgs];
      switch (level) {
        case 1:
          log.error(...outArgs);
          break;
        case 2:
          log.warn(...outArgs);
          break;
        case 3:
          log.info(...outArgs);
          break;
        case 4:
          log.debug(...outArgs);
          break;
        case 5:
          log.trace(...outArgs);
          break;
        default:
          log.error("Invalid logLevel: ", level);
      }
    },
    setTelemetryCollector(handler) {
      telemetryCollector = handler;
    },
    logTelemetry(event) {
      telemetryCollector?.(event);
    },
    isTelemetryEnabled() {
      return !!telemetryCollector;
    }
  };
  globalThis.qscLog = log;

  // node_modules/qsharp-lang/dist/compiler/common.js
  function outputAsResult(msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj?.type == "Result" && typeof obj.success == "boolean") {
        return {
          type: "Result",
          result: {
            success: obj.success,
            value: obj.result
          }
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  function outputAsMessage(msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj?.type == "Message" && typeof obj.message == "string") {
        return obj;
      }
    } catch {
      return null;
    }
    return null;
  }
  function outputAsDump(msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj?.type == "DumpMachine" && typeof obj.state == "object") {
        return obj;
      }
    } catch {
      return null;
    }
    return null;
  }
  function outputAsMatrix(msg) {
    try {
      const obj = JSON.parse(msg);
      if (obj?.type == "Matrix" && Array.isArray(obj.matrix)) {
        return obj;
      }
    } catch {
      return null;
    }
    return null;
  }
  function eventStringToMsg(msg) {
    return outputAsResult(msg) || outputAsMessage(msg) || outputAsDump(msg) || outputAsMatrix(msg);
  }

  // node_modules/qsharp-lang/dist/compiler/events.js
  function makeEvent(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }

  // node_modules/qsharp-lang/dist/diagnostics.js
  var QdkDiagnostics = class extends Error {
    constructor(diagnostics) {
      const message = shortMessage(diagnostics);
      super(message);
      __publicField(this, "diagnostics");
      this.diagnostics = diagnostics;
      this.name = "QdkDiagnostics";
    }
  };
  async function callAndTransformExceptions(fn) {
    try {
      return await fn();
    } catch (e) {
      const QdkDiagnostics2 = tryParseQdkDiagnostics(e);
      if (QdkDiagnostics2) {
        throw QdkDiagnostics2;
      }
      throw e;
    }
  }
  function tryParseQdkDiagnostics(e) {
    if (typeof e === "string") {
      try {
        const errors = JSON.parse(e);
        if (Array.isArray(errors) && errors.length > 0 && errors[0].document && errors[0].diagnostic) {
          return new QdkDiagnostics(errors);
        }
      } catch {
        log.warn(`could not parse error string ${e}`);
      }
    }
    return void 0;
  }
  function shortMessage(errors) {
    const error = errors[0];
    return `${error.diagnostic.message}${friendlyLocation(error.document, error.diagnostic.range)}`;
  }
  function friendlyLocation(uriOrName, range) {
    if (uriOrName === "<project>") {
      return "";
    }
    const lastSlash = Math.max(uriOrName.lastIndexOf("/"), uriOrName.lastIndexOf("\\"));
    const basename = lastSlash >= 0 ? uriOrName.substring(lastSlash + 1) : uriOrName;
    const lineColumn = range.start.line > 0 || range.start.character > 0 ? `:${range.start.line + 1}:${range.start.character + 1}` : "";
    return ` at ${basename}${lineColumn}`;
  }

  // node_modules/qsharp-lang/dist/compiler/compiler.js
  function toWasmProgramConfig(program, defaultProfile) {
    let packageGraphSources;
    if ("sources" in program) {
      packageGraphSources = {
        root: {
          sources: program.sources,
          languageFeatures: program.languageFeatures || [],
          dependencies: {}
        },
        packages: {},
        hasManifest: false
        // "sources" is only used in scenarios where there is no manifest
      };
    } else {
      packageGraphSources = program.packageGraphSources;
    }
    return {
      packageGraphSources,
      profile: program.profile || defaultProfile,
      projectType: program.projectType || "qsharp"
    };
  }

  // node_modules/qsharp-lang/dist/debug-service/debug-service.js
  var QSharpDebugService = class {
    constructor(wasm2) {
      __publicField(this, "wasm");
      __publicField(this, "debugService");
      log.info("Constructing a QSharpDebugService instance");
      this.wasm = wasm2;
      this.debugService = new wasm2.DebugService();
    }
    async loadProgram(program, entry) {
      return this.debugService.load_program(toWasmProgramConfig(program, "unrestricted"), entry);
    }
    async getBreakpoints(path) {
      return this.debugService.get_breakpoints(path).spans;
    }
    async getLocalVariables(frameID) {
      const variable_list = this.debugService.get_locals(frameID);
      return variable_list.variables;
    }
    async captureQuantumState() {
      const state = this.debugService.capture_quantum_state();
      return state.entries;
    }
    async getCircuit() {
      const circuit = this.debugService.get_circuit();
      return {
        circuits: [circuit],
        version: CURRENT_VERSION
      };
    }
    async getStackFrames() {
      return this.debugService.get_stack_frames().frames;
    }
    async evalContinue(bps, eventHandler) {
      const event_cb = (msg) => onCompilerEvent(msg, eventHandler);
      const ids = new Uint32Array(bps);
      return await callAndTransformExceptions(async () => this.debugService.eval_continue(event_cb, ids));
    }
    async evalNext(bps, eventHandler) {
      const event_cb = (msg) => onCompilerEvent(msg, eventHandler);
      const ids = new Uint32Array(bps);
      return await callAndTransformExceptions(async () => this.debugService.eval_next(event_cb, ids));
    }
    async evalStepIn(bps, eventHandler) {
      const event_cb = (msg) => onCompilerEvent(msg, eventHandler);
      const ids = new Uint32Array(bps);
      return await callAndTransformExceptions(async () => this.debugService.eval_step_in(event_cb, ids));
    }
    async evalStepOut(bps, eventHandler) {
      const event_cb = (msg) => onCompilerEvent(msg, eventHandler);
      const ids = new Uint32Array(bps);
      return await callAndTransformExceptions(async () => this.debugService.eval_step_out(event_cb, ids));
    }
    async dispose() {
      this.debugService.free();
    }
  };
  function onCompilerEvent(msg, eventTarget) {
    const qscMsg = eventStringToMsg(msg);
    if (!qscMsg) {
      log.error("Unknown event message: %s", msg);
      return;
    }
    let qscEvent;
    const msgType = qscMsg.type;
    switch (msgType) {
      case "Message":
        qscEvent = makeEvent("Message", qscMsg.message);
        break;
      case "DumpMachine":
        qscEvent = makeEvent("DumpMachine", {
          state: qscMsg.state,
          stateLatex: qscMsg.stateLatex,
          qubitCount: qscMsg.qubitCount
        });
        break;
      case "Result":
        qscEvent = makeEvent("Result", qscMsg.result);
        break;
      case "Matrix":
        qscEvent = makeEvent("Matrix", {
          matrix: qscMsg.matrix,
          matrixLatex: qscMsg.matrixLatex
        });
        break;
      default:
        log.never(msgType);
        throw "Unexpected message type";
    }
    log.debug("worker dispatching event " + JSON.stringify(qscEvent));
    eventTarget.dispatchEvent(qscEvent);
  }

  // node_modules/qsharp-lang/dist/main.js
  var wasmModule2 = null;
  var wasmModulePromise = null;
  var wasmInstancePromise = null;
  async function wasmLoader(uriOrBuffer) {
    if (typeof uriOrBuffer === "string") {
      log.info("Fetching wasm module from %s", uriOrBuffer);
      performance.mark("fetch-wasm-start");
      const wasmRequest = await fetch(uriOrBuffer);
      const wasmBuffer = await wasmRequest.arrayBuffer();
      const fetchTiming = performance.measure("fetch-wasm", "fetch-wasm-start");
      log.logTelemetry({
        id: "fetch-wasm",
        data: {
          duration: fetchTiming.duration,
          uri: uriOrBuffer
        }
      });
      wasmModule2 = await WebAssembly.compile(wasmBuffer);
    } else {
      log.info("Compiling wasm module from provided buffer");
      wasmModule2 = await WebAssembly.compile(uriOrBuffer);
    }
  }
  function loadWasmModule(uriOrBuffer) {
    if (!wasmModulePromise) {
      wasmModulePromise = wasmLoader(uriOrBuffer);
    }
    return wasmModulePromise;
  }
  async function instantiateWasm() {
    if (!wasmModulePromise)
      throw "Wasm module must be loaded first";
    await wasmModulePromise;
    if (!wasmModule2)
      throw "Wasm module failed to load";
    if (wasmInstancePromise) {
      await wasmInstancePromise;
      return;
    }
    wasmInstancePromise = __wbg_init({ module_or_path: wasmModule2 });
    await wasmInstancePromise;
    initLogging((level, target, ...args) => {
      if (level === 1) {
        log.logTelemetry({ id: "wasm-error", data: { panicTarget: target } });
      }
      log.logWithLevel(level, target, ...args);
    }, log.getLogLevel());
    log.onLevelChanged = (level) => setLogLevel(level);
  }
  async function getDebugService() {
    await instantiateWasm();
    return new QSharpDebugService(qsc_wasm_exports);
  }

  // node_modules/qsharp-lang/dist/browser.js
  globalThis.WorkerHost = BrowserWorkerHost;

  // src/script/qsharpRuntime.js
  var wasmReady;
  function ensureWasm(wasmUri) {
    if (!wasmReady) wasmReady = loadWasmModule(wasmUri);
    return wasmReady;
  }
  function parseAmplitude(value) {
    const normalized = String(value || "").replace(/\s/g, "").replace(/𝑖/g, "i");
    const complex = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([+-](?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)i$/i);
    if (complex) return { re: Number(complex[1]), im: Number(complex[2]) };
    const imaginary = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)i$/i);
    if (imaginary) return { re: 0, im: Number(imaginary[1]) };
    const real = Number.parseFloat(normalized);
    return { re: Number.isFinite(real) ? real : 0, im: 0 };
  }
  function snapshotFromEntries(entries) {
    const basisEntries = entries.map((entry) => ({ bits: String(entry.name || "").match(/^\|([01]+)⟩$/)?.[1], value: parseAmplitude(entry.value) })).filter((entry) => entry.bits);
    if (basisEntries.length === 0) return null;
    const qubits = Math.max(...basisEntries.map((entry) => entry.bits.length));
    const amplitudes = Array.from({ length: 2 ** qubits }, () => ({ re: 0, im: 0 }));
    for (const entry of basisEntries) {
      const index = Number.parseInt(entry.bits, 2);
      if (index < amplitudes.length) amplitudes[index] = entry.value;
    }
    return { amplitudes, qubits };
  }
  function snapshotSignature(snapshot) {
    return `${snapshot.qubits}:${snapshot.amplitudes.map((value) => `${value.re.toPrecision(12)},${value.im.toPrecision(12)}`).join(";")}`;
  }
  function formatFailure(message) {
    return typeof message === "string" ? message.trim() : String(message || "Unknown Q# execution error.");
  }
  async function executeQSharp(source, fileName, wasmUri) {
    await ensureWasm(wasmUri);
    const debugService = await getDebugService();
    const sourceName = fileName || "main.qs";
    const result = { qubitsDeclared: 0, qubitsList: [], states: [], steps: [] };
    let lastSignature = null;
    try {
      const loadFailure = await debugService.loadProgram({
        sources: [[sourceName, source]],
        languageFeatures: [],
        profile: "unrestricted"
      }, void 0);
      if (loadFailure && loadFailure.trim()) {
        result.error = formatFailure(loadFailure);
        return result;
      }
      const breakpoints = await debugService.getBreakpoints(sourceName);
      const breakpointIds = breakpoints.map((breakpoint) => breakpoint.id);
      const events = { dispatchEvent: () => true };
      for (let stepNumber = 0; stepNumber < 1e4; stepNumber++) {
        const step = await debugService.evalNext(breakpointIds, events);
        const snapshot = snapshotFromEntries(await debugService.captureQuantumState());
        if (snapshot) {
          result.qubitsDeclared = Math.max(result.qubitsDeclared, snapshot.qubits);
          const signature = snapshotSignature(snapshot);
          if (signature !== lastSignature) {
            lastSignature = signature;
            result.states.push(snapshot);
          }
        }
        result.steps.push({
          resultId: step.id,
          breakpointId: step.value,
          range: breakpoints.find((breakpoint) => breakpoint.id === step.value)?.range || null
        });
        if (step.id === StepResultId.Fail) {
          result.error = formatFailure(step.error);
          break;
        }
        if (step.id === StepResultId.Return) break;
      }
      if (result.steps.length >= 1e4 && !result.error) {
        result.error = "Q# execution exceeded the 10,000-step safety limit.";
      }
      result.qubitsList = Array.from({ length: result.qubitsDeclared }, (_, index) => `q${index}`);
      return result;
    } finally {
      await debugService.dispose();
    }
  }
  function parseQSharp(source) {
    const canvas = document.querySelector("canvas");
    return executeQSharp(source, "main.qs", canvas?.dataset.qsharpWasm);
  }
  if (typeof window !== "undefined") {
    window.qsphereQSharpRuntime = { executeQSharp };
    window.parseQSharp = parseQSharp;
  }
})();
