import { CompiledModel, Tensor, loadAndCompile, loadLiteRt } from '@litertjs/core'
import { MODEL_LABELS } from '../game/categories'

const DEFAULT_MODEL_URL =
  'https://huggingface.co/zarqankhn/quickdraw-345-tflite/resolve/main/quickdraw_model.tflite'
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/'
const EXPECTED_INPUT = [1, 28, 28, 1]
const EXPECTED_OUTPUT = [1, 345]

let runtimePromise: Promise<void> | null = null

function ensureRuntime(): Promise<void> {
  runtimePromise ??= (async () => {
    await loadLiteRt(WASM_BASE_URL)
  })()
  return runtimePromise
}

function sameShape(actual: Int32Array, expected: number[]): boolean {
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value)
}

export class QuickDrawClassifier {
  private model: CompiledModel | null = null
  readonly modelUrl: string

  constructor(modelUrl = import.meta.env.VITE_QUICKDRAW_MODEL_URL || DEFAULT_MODEL_URL) {
    this.modelUrl = modelUrl
  }

  async load(): Promise<void> {
    if (this.model) return
    await ensureRuntime()
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
  }

  async predict(inputValues: Float32Array): Promise<Float32Array> {
    if (!this.model) throw new Error('QuickDraw model is not loaded.')
    if (inputValues.length !== 28 * 28) throw new Error('QuickDraw input must contain exactly 784 pixels.')

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

  get labels(): readonly string[] {
    return MODEL_LABELS
  }

  dispose(): void {
    this.model?.delete()
    this.model = null
  }
}
