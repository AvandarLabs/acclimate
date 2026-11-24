/**
 * Parameter definition and value-inference types shared across CLI builders,
 * parsers, and help-text formatters.
 */

/** Scalar runtime value accepted or produced for a single CLI parameter. */
export type CLIParamScalarValue = string | number | boolean;

/** Runtime value produced for any parsed CLI parameter or positional arg. */
export type CLIParamDataType =
  | CLIParamScalarValue
  | string[]
  | number[]
  | boolean[]
  | undefined;

/** Positional argument identifier name. */
export type CLIPositionalParamName = string;

/** Sub-command identifier name. */
export type CLICommandName = string;

/** Canonical long option flag name starting with `--`. */
export type CLIFullOptionName = `--${string}`;

/** Option alias starting with `-` or `--`. */
export type CLIOptionAlias = `--${string}` | `-${string}`;

/** Example invocation displayed in a command's generated help text. */
export type CLIExample =
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
export type CLIBaseParam<PName extends string> = {
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
export type CLIStringParam<
  PName extends string,
  PValue extends string = string,
> = CLIBaseParam<PName> & {
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
export type CLINumberParam<
  PName extends string,
  PValue extends number = number,
> = CLIBaseParam<PName> & {
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
export type CLIBooleanParam<PName extends string> = CLIBaseParam<PName> & {
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
export type CLIParam<PName extends string = string> =
  | CLIStringParam<PName>
  | CLINumberParam<PName>
  | CLIBooleanParam<PName>;

/** Configuration for a single-value (non-variadic) positional argument. */
export type CLIScalarPositionalParam<PName extends string = string> =
  CLIParam<PName> & {
    /**
     * Whether the positional argument is required. Optional positional
     * arguments cannot precede required ones.
     */
    required: boolean;

    /** Explicitly marks a single-value positional argument. */
    variadic?: false;
  };

/** Configuration for a repeatable (variadic) string positional argument. */
export type CLIVariadicStringParam<
  PName extends string,
  PValue extends string = string,
> = CLIBaseParam<PName> & {
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
export type CLIVariadicNumberParam<
  PName extends string,
  PValue extends number = number,
> = CLIBaseParam<PName> & {
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
export type CLIVariadicBooleanParam<PName extends string> =
  CLIBaseParam<PName> & {
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
export type CLIVariadicPositionalParam<PName extends string = string> =
  | CLIVariadicStringParam<PName>
  | CLIVariadicNumberParam<PName>
  | CLIVariadicBooleanParam<PName>;

/** Union of scalar and variadic positional argument configurations. */
export type CLIPositionalParam<PName extends string = string> =
  | CLIScalarPositionalParam<PName>
  | CLIVariadicPositionalParam<PName>;

/** Configuration for a named option (`--flag`) on a CLI or globally. */
export type CLIOptionParam<
  PName extends CLIFullOptionName = CLIFullOptionName,
> = CLIParam<PName> & {
  /** Short or long aliases starting with `-` or `--`, unique within the CLI. */
  aliases?: readonly CLIOptionAlias[];

  /** Whether the option must be supplied on the command line. */
  required: boolean;
};

/** Infers the parsed TypeScript runtime value type for a parameter config. */
export type ValueOfParam<T extends CLIParam | CLIVariadicPositionalParam> =
  T extends CLIVariadicStringParam<string, infer PValue> ? PValue[]
  : T extends CLIVariadicNumberParam<string, infer PValue> ? PValue[]
  : T extends CLIVariadicBooleanParam<string> ? boolean[]
  : T extends CLIStringParam<string, infer PValue> ? PValue
  : T extends CLINumberParam<string, infer PValue> ? PValue
  : T extends CLIBooleanParam<string> ? boolean
  : never;
