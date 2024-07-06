/*  
    代币的精度统一为6， 因为USD的精度为6
    在pages/deployer/data.ts文件中，将decimals的default值调整为6

    在部署合约时，如果传入tonAmountIn参数（带精度），则同时购买
    const params: JettonDeployParams = {
      owner: Address.parse(walletAddress),
      onchainMetaData: {
        name: data.name,
        symbol: data.symbol,
        image: data.tokenImage,
        description: data.description,
        decimals: parseInt(data.decimals).toFixed(0),
      },
      offchainUri: data.offchainUri,
      tonAmountIn: toDecimalsBN(data.tonAmountIn, 9),   //不带这个参数则直接部署
    };
    const deployParams = createDeployParams(params, data.offchainUri);
    const contractAddress = new ContractDeployer().addressForContract(deployParams);
    .....(pages/deployer/index.tsx)

    购买时代码参考
    await jettonDeployController.buy(
        tonconnect,
        Address.parse(minterAddress!),
        toDecimalsBN(tonAmountIn!.toString(), 9),
        toDecimalsBN(minOut!.toString(), 6),
        connectedWalletAddress!
    );  

    各接口函数的参数说明在deploy-controller.ts
*/
