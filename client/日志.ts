/*  
    购买时：
    var log = begin_cell()
            .store_uint(0x10, 6)
            .store_slice(log_address)
            .store_coins(0)
            .store_uint(1, 107)
            .store_ref(begin_cell()
                .store_uint(op::buy, 32)            //8888
                .store_slice(my_address())          //minter地址
                .store_slice(sender_address)        //购买人地址
                .store_coins(ton_amount_in)         //本次购买的TON输入数量，精度9
                .store_coins(jetton_amount_out)     //本次购买的代币输出数量，精度6
                .store_slice(referral_address)      //推荐人地址，暂时为空地址
                .store_coins(0)                     //奖励，暂时为0
                .store_coins(reserve_ton)           //购买后合约的TON储备值，精度9
                .store_coins(reserve_jetton)        //购买后合约的代币储备值，精度6
                .store_uint(now(), 32)              //交易时间，秒数
                .end_cell()
            );
    send_raw_message(log.end_cell(), 1);

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
