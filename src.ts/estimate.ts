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
  runState._checkpoints.push(clone(runState));
};

const makeUnsignedTransaction = (txParams) => {
  const tx = Object.create(Transaction.fromTxData({ ...txParams, v: '', r: '', s: '' }));
  const { from } = txParams;
  tx.getSenderAddress = () => addressFromHex(from);
  return tx;
};

const pop = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  Object.assign(runState, runState._checkpoints.pop());
};

export function mutateVMForHypotheticals(vm: any, provider: any) {
  const handlers: any = new Map(...[vm.evm._handlers.entries()]);
  const originalJumpi = handlers.get(OP_JUMPI);
  vm.eei.provider = provider;
  const storageLoad = vm.eei.storageLoad;
  const proxy = vm;
  proxy.eei = vm.eei;
  proxy.eei.storageLoad = async function (
    address: any,
    key: any,
    original: boolean = false
  ) {
    if (original)
      return Buffer.from(
        ethers.toBeArray(
          await provider.getStorageAt(
            ethers.getAddress(ethers.zeroPadValue(ethers.hexlify(address), 20)),
            ethers.zeroPadValue(ethers.hexlify(key), 0x20)
          )
        )
      );
    else return storageLoad.call(this, address, key, original);
  };
  proxy.eei.getExternalBalance = async (address) => {
    return Buffer.from(
      ethers.toBeArray(
        await provider.getBalance(
          ethers.getAddress(
            ethers.zeroPadValue(ethers.hexlify(ethers.toBeArray(address)), 20)
          )
        )
      )
    );
  };
  proxy.eei.getContractCode = async function (address) {
    return Buffer.from(
      ethers.toBeArray(
        await provider.getCode(
          ethers.getAddress(ethers.hexlify(ethers.toBeArray(address)))
        )
      )
    );
  };
  handlers.set(OP_JUMPI, (runState: any) => {
    console.log('woop');
    checkpoint(runState);
    return originalJumpi(runState);
  });
  handlers.set(OP_REVERT, (runState: any) => {
    pop(runState);
    const [dest, cond] = runState.stack.popN(2);
    runState.stack.push(dest);
    runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
//    return originalJumpi(runState);
  });
  proxy.evm._handlers = handlers;
  return proxy;
}

export async function estimateGas(provider: any, txParams: any) {
  const vm = await (VM as any).create();
  const proxy = mutateVMForHypotheticals(vm, provider);
  const block = await proxy.runTx({ tx: makeUnsignedTransaction(txParams), skipBalance: true });
  return block;
};
