/**
 * Parameter definition and value-inference types shared across CLI builders,
 * parsers, and help-text formatters.
 */

/** Scalar runtime value accepted or produced for a single CLI parameter. */
export type CliParamScalarValue = string | number | boolean;

/** Runtime value produced for any parsed CLI parameter or positional arg. */
export type CliParamDataType =
  | CliParamScalarValue
  | string[]
  | number[]
  | boolean[]
  | undefined;

/** Positional argument identifier name. */
export type CliPositionalParamName = string;

/** Sub-command identifier name. */
export type CliCommandName = string;

/** Canonical long option flag name starting with `--`. */
export type CliFullOptionName = `--${string}`;

/** Option alias starting with `-` or `--`. */
export type CliOptionAlias = `--${string}` | `-${string}`;

/** Example invocation displayed in a command's generated help text. */
export type CliExample =
  | string
  | {
      /** Example shell command line. */
      command: string;

      /** Optional explanation of what the example demonstrates. */
      description?: string;
    };

/** Minimal writable stream contract used for stdout/stderr injection. */
export type OutputStream = {
  write: (chunk: string) => unknown;
};

/** Fields shared by all scalar and variadic CLI parameter configurations. */
export type CliBaseParam<PName extends string> = {
  /** The name of the parameter. */
  name: PName;

  /** Human-readable description shown in help text and prompts. */
  description?: string;

  /**
   * Whether to interactively prompt when no value is provided on the command
   * line. Pass `true` for a default prompt or `{ message }` for custom text.
   */
  askIfEmpty?:
    | boolean
    | {
        message: string;
      };
};

/** Configuration for a scalar string CLI parameter. */
export type CliStringParam<
  PName extends string,
  PValue extends string = string,
> = CliBaseParam<PName> & {
  type: "string";

  /** Allowed string values enforced after parsing. */
  choices?: readonly PValue[];

  /**
   * Default value applied when omitted and `required` is `false`. Ignored on
   * non-interactive required parameters.
   */
  defaultValue?: PValue;

  /**
   * Custom validator invoked on the parsed value. Return `true` if valid,
   * `false` for a generic error, or a string error message.
   */
  validator?: (value: PValue) => boolean | string;

  /** Custom parser turning raw CLI string input into `PValue`. */
  parser?: (value: string) => PValue;
};

/** Configuration for a scalar numeric CLI parameter. */
export type CliNumberParam<
  PName extends string,
  PValue extends number = number,
> = CliBaseParam<PName> & {
  type: "number";

  /** Allowed numeric values enforced after parsing. */
  choices?: readonly PValue[];

  /**
   * Default value applied when omitted and `required` is `false`. Ignored on
   * non-interactive required parameters.
   */
  defaultValue?: PValue;

  /**
   * Custom validator invoked on the parsed value. Return `true` if valid,
   * `false` for a generic error, or a string error message.
   */
  validator?: (value: PValue) => boolean | string;

  /**
   * Custom parser turning raw CLI string input into `PValue`. Defaults to
   * base-10 integer parsing (`Number.parseInt(value, 10)`).
   */
  parser?: (value: string) => PValue;
};

/** Configuration for a scalar boolean CLI parameter. */
export type CliBooleanParam<PName extends string> = CliBaseParam<PName> & {
  type: "boolean";

  /**
   * Default value applied when omitted and `required` is `false`. Ignored on
   * non-interactive required parameters.
   */
  defaultValue?: boolean;

  /**
   * Custom validator invoked on the parsed value. Return `true` if valid,
   * `false` for a generic error, or a string error message.
   */
  validator?: (value: boolean) => boolean | string;

  /**
   * Custom parser turning raw CLI string input into a boolean. Defaults to
   * treating `"false"` as `false` and all other values (including `""`) as
   * `true`.
   */
  parser?: (value: string) => boolean;
};

/** Union of all scalar parameter shapes (string, number, or boolean). */
export type CliParam<PName extends string = string> =
  | CliStringParam<PName>
  | CliNumberParam<PName>
  | CliBooleanParam<PName>;

/** Configuration for a single-value (non-variadic) positional argument. */
export type CliScalarPositionalParam<PName extends string = string> =
  CliParam<PName> & {
    /**
     * Whether the positional argument is required. Optional positional
     * arguments cannot precede required ones.
     */
    required: boolean;

    /** Explicitly marks a single-value positional argument. */
    variadic?: false;
  };

/** Configuration for a repeatable (variadic) string positional argument. */
export type CliVariadicStringParam<
  PName extends string,
  PValue extends string = string,
> = CliBaseParam<PName> & {
  type: "string";
  variadic: true;

  /** When `true`, requires at least one value; when `false`, allows zero. */
  required: boolean;

  /** Allowed string values enforced on every parsed element. */
  choices?: readonly PValue[];

  /** Default array applied when zero values are supplied and optional. */
  defaultValue?: readonly PValue[];

  /** Custom validator invoked on every parsed element. */
  validator?: (value: PValue) => boolean | string;

  /** Custom parser invoked on every raw positional token. */
  parser?: (value: string) => PValue;
};

/** Configuration for a repeatable (variadic) numeric positional argument. */
export type CliVariadicNumberParam<
  PName extends string,
  PValue extends number = number,
> = CliBaseParam<PName> & {
  type: "number";
  variadic: true;

  /** When `true`, requires at least one value; when `false`, allows zero. */
  required: boolean;

  /** Allowed numeric values enforced on every parsed element. */
  choices?: readonly PValue[];

  /** Default array applied when zero values are supplied and optional. */
  defaultValue?: readonly PValue[];

  /** Custom validator invoked on every parsed element. */
  validator?: (value: PValue) => boolean | string;

  /** Custom parser invoked on every raw positional token. */
  parser?: (value: string) => PValue;
};

/** Configuration for a repeatable (variadic) boolean positional argument. */
export type CliVariadicBooleanParam<PName extends string> =
  CliBaseParam<PName> & {
    type: "boolean";
    variadic: true;

    /** When `true`, requires at least one value; when `false`, allows zero. */
    required: boolean;

    /** Default array applied when zero values are supplied and optional. */
    defaultValue?: readonly boolean[];

    /** Custom validator invoked on every parsed element. */
    validator?: (value: boolean) => boolean | string;

    /** Custom parser invoked on every raw positional token. */
    parser?: (value: string) => boolean;
  };

/** Union of all repeatable (variadic) positional argument configurations. */
export type CliVariadicPositionalParam<PName extends string = string> =
  | CliVariadicStringParam<PName>
  | CliVariadicNumberParam<PName>
  | CliVariadicBooleanParam<PName>;

/** Union of scalar and variadic positional argument configurations. */
export type CliPositionalParam<PName extends string = string> =
  | CliScalarPositionalParam<PName>
  | CliVariadicPositionalParam<PName>;

/** Configuration for a named option (`--flag`) on a CLI or globally. */
export type CliOptionParam<
  PName extends CliFullOptionName = CliFullOptionName,
> = CliParam<PName> & {
  /** Short or long aliases starting with `-` or `--`, unique within the CLI. */
  aliases?: readonly CliOptionAlias[];

  /** Whether the option must be supplied on the command line. */
  required: boolean;
};

/** Infers the parsed TypeScript runtime value type for a parameter config. */
export type ValueOfParam<T extends CliParam | CliVariadicPositionalParam> =
  T extends CliVariadicStringParam<string, infer PValue> ? PValue[]
  : T extends CliVariadicNumberParam<string, infer PValue> ? PValue[]
  : T extends CliVariadicBooleanParam<string> ? boolean[]
  : T extends CliStringParam<string, infer PValue> ? PValue
  : T extends CliNumberParam<string, infer PValue> ? PValue
  : T extends CliBooleanParam<string> ? boolean
  : never;
