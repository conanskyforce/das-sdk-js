export interface BlockchainNetworkUrlMap {
  [key: string]: string | undefined;
}

export type ProviderParams = unknown[] | Record<string, unknown>;
export interface RequestArguments {
  method: string;
  params?: ProviderParams;
}

// TypeScript will infer a string union type from the literal values passed to
// this function. Without `extends string`, it would instead generalize them
// to the common string type.
// @see https://stackoverflow.com/questions/36836011/checking-validity-of-string-literal-union-type-at-runtime
const StringUnion = <UnionType extends string>(...values: UnionType[]) => {
  Object.freeze(values);
  const valueSet: Set<string> = new Set(values);

  const guard = (value: string): value is UnionType => {
    return valueSet.has(value);
  };

  const check = (value: string): UnionType => {
    if (!guard(value)) {
      const actual = JSON.stringify(value);
      const expected = values.map((s) => JSON.stringify(s)).join(' | ');
      throw new TypeError(
        `Value '${actual}' is not assignable to type '${expected}'.`,
      );
    }
    return value;
  };

  const unionNamespace = {guard, check, values};

  type UnionNamespaceType = (typeof unionNamespace) & {type: UnionType}

  return Object.freeze(
    unionNamespace as UnionNamespaceType,
  );
};

export const DasSupportedNetwork = StringUnion('mainnet', 'aggron', 'testnet')
