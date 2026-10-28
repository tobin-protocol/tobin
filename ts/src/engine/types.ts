// Engine data types. Addresses are strkeys (G... or C...), ids are 64 lower-case hex characters (32 bytes), amounts are `bigint`.

export interface Obligation {
  id: string;
  debtor: string;
  creditor: string;
  amount: bigint;
}

export interface Instruction {
  payer: string;
  payee: string;
  amount: bigint;
}

/** `net = outgoing obligations - incoming obligations`: positive = net debtor, negative = net creditor, zero = no net transfer. */
export interface NetPosition {
  participant: string;
  net: bigint;
}

/** Contract error names that the advisory validator can report (the same names as the contract's error table). */
export type ValidationError =
  | 'TooManyInstructions'
  | 'BadAmount'
  | 'InstructionSelfPay'
  | 'UnknownParty'
  | 'InstructionOrder'
  | 'OffsettingFlows'
  | 'FlowMismatch'
  | 'Overflow';

export type ValidationResult = { ok: true } | { ok: false; error: ValidationError; message: string };
