import { ethers } from "ethers";
import clone from "clone";
import { VM } from "@ethereumjs/vm";
import { Transaction } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util";


const addressFromHex = (s) => new Address(Buffer.from(ethers.toBeArray(s)));

const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);
const copyMemory = (memory: any) => {
  const Memory = memory.constructor;
  const copy = new Memory();
  copy.write(0, memory._store.length, memory._store);
  return copy;
};

const copyStack = (stack: any) => {
  const Stack = stack.constructor;
  const copy = new Stack((stack as any)._maxHeight);
  (copy as any)._store = (stack as any)._store.slice();
  return copy;
};

const copyInterpreter = (
  runState: any,
) => {
  const Interpreter = runState.interpreter.constructor;
  const copy = new Interpreter(
    (runState.interpreter as any)._evm,
    runState.eei,
    runState.env,
    runState.gasLeft
  );
  return copy;
};

const copyRunState = (runState: any) => {
  const stateManager = ((runState.stateManager || runState.eei._stateManager) as any).copy();
  const env = runState.env;
  const copy = {
    programCounter: runState.programCounter,
    opCode: runState.opCode,
    memory: copyMemory(runState.memory),
    memoryWordCount: runState.memoryWordCount,
    highestMemCost: runState.highestMemCost,
    stack: copyStack(runState.stack),
    returnStack: copyStack(runState.returnStack),
    code: runState.code,
    shouldDoJumpAnalysis: runState.shouldDoJumpAnalysis,
    validJumps: runState.validJumps,
    eei: runState.eei,
    env,
    messageGasLimit: runState.messageGasLimit,
    interpreter: copyInterpreter(runState),
    gasRefund: runState.gasRefund,
    gasLeft: runState.gasLeft,
    auth: runState.auth,
    returnBuffer: runState.returnBuffer
  };
  (copy.interpreter as any)._runState = copy;
  return copy;
};

const checkpoint = (runState: any) => {
  if (!(runState as any)._checkpoints) (runState as any)._checkpoints = [];
  const copy = copyRunState(runState);
  (runState as any)._checkpoints.push(copy);
};

const numberToHex = (n: any) =>
  n.toHexString ? n.toHexString() : ethers.hexlify(ethers.toBeArray(n));

const makeUnsignedTransaction = (provider, txParams) => {
  const gasLimit = txParams.gasLimit || BigInt(10e6);
  const gasPrice = txParams.gasPrice || '0x00';
  const params = Object.assign(
    { gasPrice, gasLimit },
    { ...txParams, v: "", r: "", s: "" }
  );
  if (!gasPrice) params.gasPrice = '0x00';
  else params.gasPrice = numberToHex(params.gasPrice);
  if (!gasLimit) delete params.gasLimit;
  else params.gasLimit = numberToHex(params.gasLimit);

  const tx = Object.create(Transaction.fromTxData(params));
  const { from } = txParams;
  tx.getSenderAddress = () => addressFromHex(from);
//  console.log({ data: '0x' + tx.data.toString('hex'), from, to: tx.to });
  return tx;
};

const pop = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  const state = runState._checkpoints.pop();
  delete state._checkpoints;
  Object.assign(runState, state);
};

const bufferToHex = (v: Buffer) => '0x' + v.toString('hex');

const logState = (tag, runState) => {
  console.log(tag + '>>');
  const copy = copyRunState(runState);
  delete copy.validJumps;
  delete (copy as any)._checkpoints;
  console.log(copy);
  console.log(tag + '<<');
};

export function mutateVMForHypotheticals(vm: any, provider: any) {
  const handlers: any = new Map(...[vm.evm._handlers.entries()]);
  const originalJumpi = handlers.get(OP_JUMPI);
  const storageLoad = vm.eei.storageLoad;
  const proxy = vm;
  proxy.eei = vm.eei;
  const touched = {};
  const _storageLoad = async function (
    address: any,
    key: any,
    original: boolean = false
  ) {
    return Buffer.from(
      ethers.toBeArray(
        ethers.zeroPadValue(await provider.getStorage(
          ethers.getAddress(address.toString()),
          ethers.hexlify(key)
        ), 0x20)
      )
    );
  };
  proxy.eei.storageLoad = async function (...args) {
    const result = await _storageLoad.apply(this, args);
    return result;
  };
  proxy.eei.getExternalBalance = async (address) => {
    return Buffer.from(
      ethers.toBeArray(
        await provider.getBalance(ethers.getAddress(address.toString()))
      )
    );
  };
  proxy.eei.getContractCode = async function (address) {
    return Buffer.from(
      (await provider.getCode(ethers.getAddress(address.toString()))).substr(2),
      "hex"
    );
  };
  handlers.set(OP_JUMPI, (runState: any) => {
    //logState('JUMPI', runState);
    if (!runState._branching) {
      checkpoint(runState);
    } else {
      runState._checkpoints.pop();
      const [dest, cond] = runState.stack.popN(2);
      runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
      runState.stack.push(dest);
    }
    runState._branching = false;
    return originalJumpi(runState);
  });
  handlers.set(OP_REVERT, (runState: any) => {
    pop(runState);
    runState._branching = true;
    //logState('REVERT', runState);
    runState.programCounter--;
  });
  proxy.evm._handlers = handlers;
  return proxy;
}

export async function estimateGas(provider: any, txParams: any) {
  const vm = await (VM as any).create();
  const { isActivatedEIP } = vm._common;
  vm._common.isActivatedEIP = function (...args) {
    const [ eip ] = args;
    if (eip === 1559) return false;
    return isActivatedEIP.apply(vm._common, args);
  };
  vm.DEBUG = true;
  const proxy = mutateVMForHypotheticals(vm, provider);
  const block = await proxy.runTx({
    tx: makeUnsignedTransaction(provider, txParams),
    skipNonce: true,
    skipBalance: true,
  });
  return block.totalGasSpent;
}
