import { VM } from "@ethereumjs/vm";

const OP_JUMPI = Number(0x57);
const OP_REVERT = Number(0xfd);

const checkpoint = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  const copy = clone(runState);
  delete copy._checkpoints;
  runState._checkpoints.push(clone(runState));
};

const pop = (runState: any) => {
  if (!runState._checkpoints) runState._checkpoints = [];
  Object.assign(runState, runState._checkpoints.pop()); 
};
 

export function mutateVMForHypotheticals(vm: any, provider: any) {
  const handlers = new Map(...[vm.evm._handlers.entries()]); 
  const originalJumpi = handlers.get(OP_JUMPI);
  vm.eei.provider = provider;
  const storageLoad = vm.eei.storageLoad;
  vm.eei.storageLoad = async function (address: any, key: any, original: boolean = false) {
    if (original) return Buffer.from(ethers.toBeArray(await provider.getStorageAt(ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(address), 20)), ethers.zeroPadValue(ethers.toBeHex(key), 0x20))));
    else return storageLoad.call(this, address, key, original);
  };
  vm.eei.getExternalBalance = async (address) => {
   return Buffer.from(ethers.toBeArray(await provider.getBalance(ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(ethers.toBeArray(address)), 20)))));
  };
  vm.eei.getContractCode = async function (address) {
    return Buffer.from(ethers.toBeArray(await provider.getCode(ethers.getAddress(ethers.toBeHex(ethers.toBeArray(address)))));
  );
  handlers.set(OP_JUMPI, (runState: any) => {
    checkpoint(runState);
    return originalJumpi(runState);
  });
  handlers.set(OP_REVERT, (runState: any) => {
    pop(runState);
    const [ dest, cond ] = runState.stack.popN(2);
    runState.stack.push(dest);
    runState.stack.push(Number(cond) ? BigInt(0) : BigInt(1));
    return originalJumpi(runState);
  });
}
  
