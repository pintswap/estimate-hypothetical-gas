import { ethers } from "ethers";
import clone from "clone";
import { VM } from "@ethereumjs/vm";
import { Transaction } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util";

const addressFromHex = (s) => new Address(Buffer.from(ethers.toBeArray(s)));

const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);

const checkpoint = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  const copy = clone(runState);
  delete copy._checkpoints;
  copy.eei = runState.eei.copy();
  delete copy.interpreter;
  delete copy.env.block;
  delete copy._branching;
  runState._checkpoints.push(copy);
};

const numberToHex = (n: any) =>
  n.toHexString ? n.toHexString() : ethers.hexlify(ethers.toBeArray(n));

const makeUnsignedTransaction = async (provider, txParams) => {
  const gasPrice =
    txParams.maxFeePerGas || txParams.gasPrice
      ? undefined
      : (await provider.getFeeData()).maxFeePerGas;
  const gasLimit = txParams.gasLimit || BigInt(10e6);
  const params = Object.assign(
    { gasPrice, gasLimit },
    { ...txParams, v: "", r: "", s: "" }
  );
  if (!gasPrice) delete params.gasPrice;
  else params.gasPrice = numberToHex(params.gasPrice);
  if (!gasLimit) delete params.gasLimit;
  else params.gasLimit = numberToHex(params.gasLimit);

  const tx = Object.create(Transaction.fromTxData(params));
  const { from } = txParams;
  tx.getSenderAddress = () => addressFromHex(from);
  return tx;
};

const pop = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  Object.assign(runState, runState._checkpoints.pop());
};

const bufferToHex = (v: Buffer) => '0x' + v.toString('hex');

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
        ethers.zeroPadValue(await provider.getStorageAt(
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
    if (!runState._branching) {
      const copy = { ...runState };
      delete copy._checkpoints;
      checkpoint(runState);
    }
    runState._branching = false;
    return originalJumpi(runState);
  });
  handlers.set(OP_REVERT, (runState: any) => {
    const copy = { ...runState };
    delete copy._checkpoints;
    pop(runState);
    const [cond, dest] = runState.stack.popN(2);
    runState.stack.push(dest);
    runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
    runState._branching = true;
  });
  proxy.evm._handlers = handlers;
  return proxy;
}

export async function estimateGas(provider: any, txParams: any) {
  const vm = await (VM as any).create();
  vm.DEBUG = true;
  const proxy = mutateVMForHypotheticals(vm, provider);
  const block = await proxy.runTx({
    tx: await makeUnsignedTransaction(provider, txParams),
    skipBalance: true,
  });
  return block;
}
