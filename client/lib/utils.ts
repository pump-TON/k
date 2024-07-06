import BN from "bn.js";
import { Address, beginCell, Cell, toNano, TonClient, Wallet } from "ton";
import { JettonDeployParams, JETTON_DEPLOY_GAS } from "./deploy-controller";
import { initData, JettonMetaDataKeys, JETTON_MINTER_CODE, buyBody } from "./jetton-minter";

//此文件修改了createDeployParams()函数，当部署合约时指定 tonAmountIn 时，部署时同时购买。否则只是部署。

export async function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

export function zeroAddress(): Address {
  return beginCell()
    .storeUint(2, 2)
    .storeUint(0, 1)
    .storeUint(0, 8)
    .storeUint(0, 256)
    .endCell()
    .beginParse()
    .readAddress() as Address;
}

export async function waitForSeqno(wallet: Wallet) {
  const seqnoBefore = await wallet.getSeqNo();

  return async () => {
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(3000);
      const seqnoAfter = await wallet.getSeqNo();
      if (seqnoAfter > seqnoBefore) return;
    }
    throw new Error("Timeout");
  };
}

export async function waitForContractDeploy(address: Address, client: TonClient) {
  let isDeployed = false;
  let maxTries = 25;
  while (!isDeployed && maxTries > 0) {
    maxTries--;
    isDeployed = await client.isContractDeployed(address);
    if (isDeployed) return;
    await sleep(3000);
  }
  throw new Error("Timeout");
}

export const createDeployParams = (params: JettonDeployParams, offchainUri?: string) => {
  const queryId = parseInt(process.env.REACT_APP_DEPLOY_QUERY_ID ?? "0");

  return {
    code: JETTON_MINTER_CODE,
    data: initData(params.owner, params.onchainMetaData, offchainUri),
    deployer: params.owner,
    value: params.tonAmountIn ? params.tonAmountIn.add(JETTON_DEPLOY_GAS) : JETTON_DEPLOY_GAS,
    message: params.tonAmountIn ? buyBody(params.owner, params.tonAmountIn, toNano(0), toNano(0.2), queryId) : undefined,
  };
};
