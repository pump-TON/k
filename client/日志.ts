 /*
    购买时修正：
    因为之前传入的推荐人地址是空地址(00,只占了两个bits)。如果推荐人地址不空，则占256bits。
    一个Cell最大1023bits，这样就超出上限。需要把推荐人和奖励信息放到另一个Cell。调整如下：

    var log = begin_cell()
            .store_uint(0x10, 6)
            .store_slice(log_address)
            .store_coins(0)
            .store_uint(1, 107)
            .store_ref(begin_cell()
                .store_uint(op::buy, 32)                    //8888
                .store_slice(my_address())                  //minter地址
                .store_slice(sender_address)                //购买人地址
                .store_coins(ton_amount_in)                 //本次购买的TON输入数量，精度9
                .store_coins(jetton_amount_out)             //本次购买的代币输出数量，精度6
                .store_coins(reserve_ton)                   //购买后合约的TON储备值，精度9
                .store_coins(reserve_jetton)                //购买后合约的代币储备值，精度6
                .store_ref(begin_cell()
                    .store_slice(referral_address)          //推荐人地址，可为空地址
                    .store_coins(reward)                    //奖励。如果推荐人不空，暂定为jetton_amount_out的10%，为空则为0
                    .end_cell()
                )
                .store_uint(now(), 32)                      //交易时间，秒数
                .end_cell() 
            );
    

    测试代码：
    const cell = Cell.fromBoc("b5ee9c7201010201008e0001c3000022b880191a324fe962d98efaa4ef0056bce6d89af341838e1ebd5630c586d4a62aef08b00283e93fbae1dfc2aad4bd4625ae8632704b0eabe2f16192f9e77d266644a20b9102faf080151d059f380168c4c5f7001c0f39e660689da99a4545c601004d801883bdd11384dcc469e9cdbc3a07f0f4d78e114ff715e55c0975c315f47117d44a0e4047f601")[0];
    const ds = cell.beginParse();
    console.log('opCode', ds.readUint(32).toString());
    console.log('minterAddress', ds.readAddress()!.toString());
    console.log('buyerAddress', ds.readAddress()!.toString());
    console.log('tonAmountIn', ds.readCoins().toString());
    console.log('jettonAmountOut', ds.readCoins().toString());
    const reserveTon = ds.readCoins();
    const reserveJetton = ds.readCoins();
    console.log('reserveTon', reserveTon.toString());
    console.log('reserveJetton', reserveJetton.toString());
    console.log('current price', reserveTon.toNumber() / reserveJetton.toNumber() / 10**3);
    const rs = ds.readRef();
    console.log('referralAddress', rs.readAddress()?.toString());
    console.log('reward', rs.readCoins().toString());
    console.log('time', ds.readUint(32).toString());
    
    测试输出：
    opCode 8888
    minterAddress 0:c8d1927f4b16cc77d5277802b5e736c4d79a0c1c70f5eab1862c36a531577845
    buyerAddress 0:a0fa4feeb877f0aab52f51896ba18c9c12c3aaf8bc5864be79df4999912882e4
    tonAmountIn 200000000
    jettonAmountOut 306040000000
    reserveTon 700400000000
    reserveJetton 1071446568347498
    current price 6.536956864589463e-7
    referralAddress 0:c41dee889c26e6234f4e6de1d03f87a6bc708a7fb8af2ae04bae18afa388bea2
    reward 30604000000
    time 1720799601
    推荐人为空则输出：
    referralAddress undefined
    reward 0


    前端的buy()接口函数
    async jettonDeployController.buy(
        tonConnection: TonConnectUI,
        jettonMaster: Address,
        tonAmountIn: BN,
        minOut: BN,
        walletAddress: string,
        referralAddress?: Address,      //可选的推荐人地址。
    )
  

    -----------------------------------------------------------------------------------
    因为价格都是浮点数，不宜在合约里计算。
    本次购买的平均价格：
        ton_amount_in 除以 10^9
        jetton_amount_out 除以 10^6
        ton_amount_in 除以 jetton_amount_out
    交易后合约的当前价格：
        reserve_ton 除以 10^9
        reserver_jetton 除以 10^6
        reserve_ton 除以 reserver_jetton


    出售时
    var log = begin_cell()
            .store_uint(0x10, 6)
            .store_slice(log_address)
            .store_coins(0)
            .store_uint(1, 107)
            .store_ref(begin_cell()
                .store_uint(op::sell, 32)           //8900
                .store_slice(my_address())          //minter地址
                .store_slice(from_address)          //出售人地址
                .store_coins(jetton_amount_in)      //本次出售的代币输入数量，精度6
                .store_coins(ton_amount_out)        //本次出售的TON输出数量，精度9
                .store_coins(reserve_ton)           //出售后合约的TON储备值
                .store_coins(reserve_jetton)        //出售后合约的代币储备值
                .store_uint(now(), 32)              //交易时间，秒数
                .end_cell()
            );
    send_raw_message(log.end_cell(), 1);

    本次出售的平均价格：
        ton_amount_out 除以 10^9
        jetton_amount_in 除以 10^6
        ton_amount_out 除以 jetton_amount_in

*/
