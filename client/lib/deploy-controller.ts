import BN from "bn.js";
import { Address, beginCell, Cell, toNano } from "ton";
import { ContractDeployer } from "./contract-deployer";

import { createDeployParams, waitForContractDeploy, waitForSeqno } from "./utils";
import { zeroAddress } from "./utils";
import {
  buildJettonOnchainMetadata,
  burn,
  buyBody,
  mintBody,
  transfer,
  updateMetadataBody,
} from "./jetton-minter";
import { readJettonMetadata, changeAdminBody, JettonMetaDataKeys, Initial_Reserve_Jetton, Initial_Reserve_Ton } from "./jetton-minter";
import { getClient } from "./get-ton-client";
import { cellToAddress, makeGetCall } from "./make-get-call";
import { SendTransactionRequest, TonConnectUI } from "@tonconnect/ui-react";

/* 此文件为合约的接口文件。新增了几个函数：
    购买：buy() 
        tonAmountIn: TON的数量。精度为9
        minOut: 设定最小的输出代币数量。用滑点来计算这个值。代币精度为6
    出售：burnJettons()
        amount: 要出售的数量。精度为6
        出售时不能设置滑点。因为出售只是销毁代币并通知minter合约，
        minter合约收到通知时代币已销毁，此时加条件限制只能是什么也得不到。
    获取两种币的储备值：getReserve() 
        用于计算当前的价格
        储备值都有各自的精度，TON的精度是9，代币的精度是6.
        前端计算价格时，无需每次都调用这个函数，为保证近似的准确性，可以每隔几秒调用一次。
    获取当前价格：getCurrentPrice() 
        调用getReserve()获得储备值，然后分别除以各自的精度。
        用ton数量除以代币数量即是代币的价格。
        如果不想每次都调用getReserve()，可以修改此函数。
    给定TON数量能买到多少代币：getJettonAmountOut()
        函数的输入输出都不带精度
        如果不想每次都调用getReserve()，可以修改此函数。
    给定代币数量能卖出多少TON: getTonAmountOut()
        函数的输入输出都不带精度
        如果不想每次都调用getReserve()，可以修改此函数。
    部署前购买代币的预估数量：getJettonAmountOutBeforeDeployment()
        函数的输入输出都不带精度
*/

export const JETTON_DEPLOY_GAS = toNano(0.25);
const tonDecimals = 10**9;
const jettonDecimals = 10**6;

export enum JettonDeployState {
  NOT_STARTED,
  BALANCE_CHECK,
  UPLOAD_IMAGE,
  UPLOAD_METADATA,
  AWAITING_MINTER_DEPLOY,
  AWAITING_JWALLET_DEPLOY,
  VERIFY_MINT,
  ALREADY_DEPLOYED,
  DONE,
}

export interface JettonDeployParams {
  onchainMetaData?: {
    name: string;
    symbol: string;
    description?: string;
    image?: string;
    decimals?: string;
  };
  offchainUri?: string;
  owner: Address;
  tonAmountIn?: BN; 
}

class JettonDeployController {

  async createJetton(
    params: JettonDeployParams,
    tonConnection: TonConnectUI,
    walletAddress: string,
  ): Promise<Address> {
    const contractDeployer = new ContractDeployer();
    const tc = await getClient();

    const balance = await tc.getBalance(params.owner);
    if (balance.lt(JETTON_DEPLOY_GAS)) throw new Error("Not enough balance in deployer wallet");
    const deployParams = createDeployParams(params, params.offchainUri);
    const contractAddr = contractDeployer.addressForContract(deployParams);

    if (await tc.isContractDeployed(contractAddr)) {

    } else {
      await contractDeployer.deployContract(deployParams, tonConnection);
      await waitForContractDeploy(contractAddr, tc);
    }

    const ownerJWalletAddr = await makeGetCall(
      contractAddr,
      "get_wallet_address",
      [beginCell().storeAddress(params.owner).endCell()],
      ([addr]) => (addr as Cell).beginParse().readAddress()!,
      tc,
    );
    
    await waitForContractDeploy(ownerJWalletAddr, tc);
    return contractAddr;
  }

  async buy(
    tonConnection: TonConnectUI,
    jettonMaster: Address,
    tonAmountIn: BN,
    minOut: BN,
    walletAddress: string,
  ) {
    const tc = await getClient();
    const waiter = await waitForSeqno(
        tc.openWalletFromAddress({
            source: Address.parse(walletAddress),
        }), 
    );
    const tx: SendTransactionRequest = {
        validUntil: Date.now() + 5 * 60 * 1000,
        messages: [
          {
            address: jettonMaster.toString(),
            amount: tonAmountIn.add(toNano(0.15)).toString(),   
            stateInit: undefined,
            payload: buyBody(Address.parse(walletAddress), tonAmountIn, minOut, toNano(0.13), 0).toBoc().toString("base64"),
          },
        ],
      };
      await tonConnection.sendTransaction(tx);
      await waiter();
  }

  async burnJettons(
    tonConnection: TonConnectUI,
    amount: BN,
    jettonAddress: string,
    walletAddress: string,
  ) {
    const tc = await getClient();

    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(walletAddress),
      }),
    );

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: jettonAddress,
          amount: toNano(0.031).toString(),
          stateInit: undefined,
          payload: burn(amount, Address.parse(walletAddress)).toBoc().toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);

    await waiter();
  }

async getReserve(minterAddress: Address) {
    const tc = await getClient();
    const reserve = await makeGetCall(
        minterAddress,
        "get_reserve_data",
        [],
        ([reserveJetton, reserveTon]) => ({
            jetton: reserveJetton as BN,
            ton: reserveTon as BN,
        }),
        tc,
    );
    return reserve;
}

async getCurrentPrice(minterAddress: Address) {
    const reserve = await this.getReserve(minterAddress);
    const ton = reserve.ton.div(new BN(tonDecimals));
    const jetton = reserve.jetton.div(new BN(jettonDecimals));
    return ton.toNumber() / jetton.toNumber();
}

async getJettonAmountOut(minterAddress: Address, amountIn: number) {
    const reserve = await this.getReserve(minterAddress);
    const tonAmountIn = new BN((amountIn * tonDecimals).toString());
    const jettonAmountOut = tonAmountIn.mul(reserve.jetton).div(reserve.ton.add(tonAmountIn));
    return jettonAmountOut.div(new BN(jettonDecimals)).toString();
}

getJettonAmountOutBeforeDeployment(amountIn: number) {
    const tonAmountIn = new BN((amountIn * tonDecimals).toString());
    const jettonAmountOut = tonAmountIn.mul(Initial_Reserve_Jetton).div(Initial_Reserve_Ton.add(tonAmountIn));
    return jettonAmountOut.div(new BN(jettonDecimals)).toString();
}

async getTonAmountOut(minterAddress: Address, amountIn: number) {
    const reserve = await this.getReserve(minterAddress);
    const jettonAmountIn = new BN(amountIn.toString()).mul(new BN(jettonDecimals));
    const tonAmountOut = jettonAmountIn.mul(reserve.ton).div(reserve.jetton.add(jettonAmountIn));
    return tonAmountOut.toNumber() / tonDecimals;
}


  async burnAdmin(contractAddress: Address, tonConnection: TonConnectUI, walletAddress: string) {
    const tc = await getClient();
    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(walletAddress),
      }),
    );

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: changeAdminBody(zeroAddress()).toBoc().toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);

    await waiter();
  }

  async transfer(
    tonConnection: TonConnectUI,
    amount: BN,
    toAddress: string,
    fromAddress: string,
    ownerJettonWallet: string,
  ) {
    const tc = await getClient();

    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(fromAddress),
      }),
    );

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: ownerJettonWallet,
          amount: toNano(0.05).toString(),
          stateInit: undefined,
          payload: transfer(Address.parse(toAddress), Address.parse(fromAddress), amount)
            .toBoc()
            .toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);

    await waiter();
  }

  async mint(
    tonConnection: TonConnectUI,
    jettonMaster: Address,
    amount: BN,
    walletAddress: string,
  ) {
    const tc = await getClient();
    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(walletAddress),
      }),
    );

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: jettonMaster.toString(),
          amount: toNano(0.04).toString(),
          stateInit: undefined,
          payload: mintBody(Address.parse(walletAddress), amount, toNano(0.02), 0)
            .toBoc()
            .toString("base64"),
        },
      ],
    };

    await tonConnection.sendTransaction(tx);
    await waiter();
  }
  
  async getJettonDetails(contractAddr: Address, owner: Address) {
    const tc = await getClient();
    const minter = await makeGetCall(
      contractAddr,
      "get_jetton_data",
      [],
      async ([totalSupply, __, adminCell, contentCell]) => ({
        ...(await readJettonMetadata(contentCell as unknown as Cell)),
        admin: cellToAddress(adminCell),
        totalSupply: totalSupply as BN,
      }),
      tc,
    );

    const jWalletAddress = await makeGetCall(
      contractAddr,
      "get_wallet_address",
      [beginCell().storeAddress(owner).endCell()],
      ([addressCell]) => cellToAddress(addressCell),
      tc,
    );

    const isDeployed = await tc.isContractDeployed(jWalletAddress);

    let jettonWallet;
    if (isDeployed) {
      jettonWallet = await makeGetCall(
        jWalletAddress,
        "get_wallet_data",
        [],
        ([amount, _, jettonMasterAddressCell]) => ({
          balance: amount as unknown as BN,
          jWalletAddress,
          jettonMasterAddress: cellToAddress(jettonMasterAddressCell),
        }),
        tc,
      );
    } else {
      jettonWallet = null;
    }

    return {
      minter,
      jettonWallet,
    };
  }

  async fixFaultyJetton(
    contractAddress: Address,
    data: {
      [s in JettonMetaDataKeys]?: string | undefined;
    },
    connection: TonConnectUI,
    walletAddress: string,
  ) {
    const tc = await getClient();
    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(walletAddress),
      }),
    );
    const body = updateMetadataBody(buildJettonOnchainMetadata(data));
    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: body.toBoc().toString("base64"),
        },
      ],
    };

    await connection.sendTransaction(tx);

    await waiter();
  }

  async updateMetadata(
    contractAddress: Address,
    data: {
      [s in JettonMetaDataKeys]?: string | undefined;
    },
    connection: TonConnectUI,
    walltAddress: string,
  ) {
    const tc = await getClient();
    const waiter = await waitForSeqno(
      tc.openWalletFromAddress({
        source: Address.parse(walltAddress),
      }),
    );

    const tx: SendTransactionRequest = {
      validUntil: Date.now() + 5 * 60 * 1000,
      messages: [
        {
          address: contractAddress.toString(),
          amount: toNano(0.01).toString(),
          stateInit: undefined,
          payload: updateMetadataBody(buildJettonOnchainMetadata(data)).toBoc().toString("base64"),
        },
      ],
    };

    await connection.sendTransaction(tx);

    await waiter();
  }
}

const jettonDeployController = new JettonDeployController();
export { jettonDeployController };
