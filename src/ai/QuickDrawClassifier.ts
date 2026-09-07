import { CompiledModel, Tensor, loadAndCompile, loadLiteRt } from '@litertjs/core'
import { MODEL_LABELS } from '../game/categories'

const DEFAULT_MODEL_URL = `${import.meta.env.BASE_URL}models/quickdraw_model.tflite`
const LITERT_WASM_BASE_URL = `${import.meta.env.BASE_URL}litert-wasm/`
const TFJS_SCRIPT_URL = `${import.meta.env.BASE_URL}tfjs/tf.min.js`
const TFJS_TFLITE_SCRIPT_URL = `${import.meta.env.BASE_URL}tfjs-tflite/tf-tflite.min.js`
const TFJS_TFLITE_WASM_BASE_URL = `${import.meta.env.BASE_URL}tfjs-tflite/wasm/`
const EXPECTED_INPUT = [1, 28, 28, 1]
const EXPECTED_OUTPUT = [1, 345]

type Backend = 'litert' | 'tfjs-tflite'

interface TfTensorLike {
  shape: number[]
  dtype: string
  dataSync: () => ArrayLike<number>
  dispose: () => void
}

interface TfTensorInfoLike {
  shape: Array<number | null>
  dtype: string
}

interface TfLiteModelLike {
  inputs: TfTensorInfoLike[]
  outputs: TfTensorInfoLike[]
  predict: (input: TfTensorLike) => TfTensorLike | TfTensorLike[]
}

interface TfGlobalLike {
  tensor: (values: Float32Array, shape: number[], dtype: 'float32') => TfTensorLike
  setBackend: (name: string) => Promise<boolean>
  ready: () => Promise<void>
}

interface TfLiteGlobalLike {
  setWasmPath: (path: string) => void
  loadTFLiteModel: (modelUrl: string, options?: { numThreads?: number }) => Promise<TfLiteModelLike>
}

declare global {
  interface Window {
    tf?: TfGlobalLike
    tflite?: TfLiteGlobalLike
  }
}

let runtimePromise: Promise<void> | null = null
let tfjsRuntimePromise: Promise<void> | null = null
const scriptPromises = new Map<string, Promise<void>>()
const fallbackModels = new Map<string, Promise<TfLiteModelLike>>()

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function ensureLiteRtRuntime(): Promise<void> {
  runtimePromise ??= loadLiteRt(LITERT_WASM_BASE_URL)
  return runtimePromise
}

function loadScriptOnce(id: string, src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve()
  const existing = scriptPromises.get(id)
  if (existing) return existing

  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.aiRuntime = id
    script.addEventListener('load', () => {
      if (ready()) resolve()
      else reject(new Error(`${id} loaded but its browser API is unavailable.`))
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true })
    document.head.appendChild(script)
  }).catch((cause) => {
    scriptPromises.delete(id)
    throw cause
  })

  scriptPromises.set(id, loading)
  return loading
}

function ensureTfjsRuntime(): Promise<void> {
  tfjsRuntimePromise ??= (async () => {
    await loadScriptOnce('tensorflow-js', TFJS_SCRIPT_URL, () => Boolean(window.tf))
    const tf = window.tf
    if (!tf) throw new Error('TensorFlow.js browser API is unavailable.')
    await tf.setBackend('cpu')
    await tf.ready()

    await loadScriptOnce('tensorflow-js-tflite', TFJS_TFLITE_SCRIPT_URL, () => Boolean(window.tflite))
    const tflite = window.tflite
    if (!tflite) throw new Error('TensorFlow.js TFLite browser API is unavailable.')
    tflite.setWasmPath(TFJS_TFLITE_WASM_BASE_URL)
  })()
  return tfjsRuntimePromise
}

function sameShape(actual: ArrayLike<number>, expected: number[]): boolean {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value)
}

function sameTfShape(actual: Array<number | null>, expected: number[]): boolean {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value || actual[index] === null)
}

async function loadFallbackModel(modelUrl: string): Promise<TfLiteModelLike> {
  const existing = fallbackModels.get(modelUrl)
  if (existing) return existing

  const loading = (async () => {
    await ensureTfjsRuntime()
    const tflite = window.tflite
    if (!tflite) throw new Error('TensorFlow.js TFLite browser API is unavailable.')
    // GitHub Pages cannot opt into cross-origin isolation, so force a single-thread runner.
    return tflite.loadTFLiteModel(modelUrl, { numThreads: 1 })
  })().catch((cause) => {
    fallbackModels.delete(modelUrl)
    throw cause
  })

  fallbackModels.set(modelUrl, loading)
  return loading
}

export class QuickDrawClassifier {
  private model: CompiledModel | null = null
  private fallbackModel: TfLiteModelLike | null = null
  private backend: Backend | null = null
  readonly modelUrl: string

  constructor(modelUrl = import.meta.env.VITE_QUICKDRAW_MODEL_URL?.trim() || DEFAULT_MODEL_URL) {
    this.modelUrl = modelUrl
  }

  async load(): Promise<void> {
    if (this.model || this.fallbackModel) return

    let liteRtFailure: unknown
    try {
      await ensureLiteRtRuntime()
      const model = await loadAndCompile(this.modelUrl, { accelerator: 'wasm' })
      const input = model.getInputDetails()[0]
      const output = model.getOutputDetails()[0]

      if (!input || !sameShape(input.shape, EXPECTED_INPUT) || input.dtype !== 'float32') {
        model.delete()
        throw new Error(`QuickDraw model input mismatch: expected float32 [${EXPECTED_INPUT.join(',')}].`)
      }
      if (!output || !sameShape(output.shape, EXPECTED_OUTPUT) || output.dtype !== 'float32') {
        model.delete()
        throw new Error(`QuickDraw model output mismatch: expected float32 [${EXPECTED_OUTPUT.join(',')}].`)
      }
      this.model = model
      this.backend = 'litert'
      return
    } catch (cause) {
      liteRtFailure = cause
      console.warn('LiteRT.js could not initialize QuickDraw; trying TensorFlow.js TFLite fallback.', cause)
    }

    try {
      const model = await loadFallbackModel(this.modelUrl)
      const input = model.inputs[0]
      const output = model.outputs[0]
      if (!input || !sameTfShape(input.shape, EXPECTED_INPUT) || input.dtype !== 'float32') {
        throw new Error(`Fallback model input mismatch: expected float32 [${EXPECTED_INPUT.join(',')}].`)
      }
      if (!output || !sameTfShape(output.shape, EXPECTED_OUTPUT) || output.dtype !== 'float32') {
        throw new Error(`Fallback model output mismatch: expected float32 [${EXPECTED_OUTPUT.join(',')}].`)
      }
      this.fallbackModel = model
      this.backend = 'tfjs-tflite'
    } catch (fallbackFailure) {
      throw new Error(
        `AI runtime failed. LiteRT: ${errorMessage(liteRtFailure)} / TFJS-TFLite: ${errorMessage(fallbackFailure)}`,
      )
    }
  }

  async predict(inputValues: Float32Array): Promise<Float32Array> {
    if (inputValues.length !== 28 * 28) throw new Error('QuickDraw input must contain exactly 784 pixels.')

    if (this.backend === 'litert' && this.model) {
      const input = new Tensor(inputValues, EXPECTED_INPUT)
      try {
        const outputs = await this.model.run(input)
        const output = outputs[0]
        if (!output) throw new Error('QuickDraw model produced no output.')
        try {
          const data = await output.data()
          return Float32Array.from(data as ArrayLike<number>)
        } finally {
          for (const tensor of outputs) tensor.delete()
        }
      } finally {
        input.delete()
      }
    }

    if (this.backend === 'tfjs-tflite' && this.fallbackModel) {
      const tf = window.tf
      if (!tf) throw new Error('TensorFlow.js browser API is unavailable.')
      const input = tf.tensor(inputValues, EXPECTED_INPUT, 'float32')
      let output: TfTensorLike | null = null
      try {
        const predicted = this.fallbackModel.predict(input)
        output = Array.isArray(predicted) ? predicted[0] ?? null : predicted
        if (!output) throw new Error('QuickDraw fallback model produced no output.')
        return Float32Array.from(output.dataSync())
      } finally {
        input.dispose()
        output?.dispose()
      }
    }

    throw new Error('QuickDraw model is not loaded.')
  }

  get labels(): readonly string[] {
    return MODEL_LABELS
  }

  dispose(): void {
    this.model?.delete()
    this.model = null
    // The TensorFlow.js TFLite API does not expose a model dispose method. The
    // fallback runner is cached and reused across rounds instead of reloading it.
    this.fallbackModel = null
    this.backend = null
  }
}
