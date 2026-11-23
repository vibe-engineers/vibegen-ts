import type { VibeGen } from "@vibe-engineers/vibegen"

export function serviceClass(gen: ReturnType<typeof VibeGen>) {
  return class Service {
    readonly secretReceiver = "private receiver state"

    @gen
    async greet(this: Service, word: string): Promise<string> {
      throw new Error(this.secretReceiver + word)
    }

    @gen({
      signature: "total(a: bigint, b: bigint): bigint",
      docstring: "Return the sum.",
      return_type: BigInt,
    })
    static async total(this: typeof Service, a: bigint, b: bigint): Promise<bigint> {
      throw new Error(String(a + b))
    }
  }
}
