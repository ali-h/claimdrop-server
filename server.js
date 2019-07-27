const steem = require('steem')
const fs = require('fs')
const config = JSON.parse(fs.readFileSync('./config.json', "utf-8"))

var streamInfo = JSON.parse(fs.readFileSync('./database/streamInfo.json', "utf-8"))
var claimdrops = JSON.parse(fs.readFileSync('./database/lists.json', "utf-8"))
var dontRef = 1
var queue = []

function writeStream(callback) {
    fs.writeFile('./database/streamInfo.json', JSON.stringify(streamInfo), function (err) {
        if (!err)
            callback()
    })
}

if (streamInfo.lastBlock == 0) {
    steem.api.getDynamicGlobalProperties(function(err, result) {
        if (!err) {
            streamInfo.lastBlock = result.head_block_number
            dontRef = 0
            getBlock()
        }
        else
            console.log(err)
    })
}
else
    getBlock()

function getBlock() {
    if (!dontRef == 0) {
        streamInfo = JSON.parse(fs.readFileSync('./database/streamInfo.json', "utf-8"))
        claimdrops = JSON.parse(fs.readFileSync('./database/lists.json', "utf-8"))
    }
    steem.api.getBlock(++streamInfo.lastBlock, function(err, result) {
        if (!err) {
            checkBlock(result.transactions, function(resARR) {
                for (num in resARR) {
                    console.log(resARR[num])
                    if (resARR[num].log == "eligible") {
                        var list_name = claimdrops[resARR[num].token_id].file_name 
                        var list = fs.readFileSync('./files/' + list_name, "utf-8")
                        checkNameInList(list, resARR[num].username, function (res) {
                            if (res == false) {
                                resARR[num].log = "not_in_list"
                            }
                            else
                                resARR[num].reward = res.reward
                            queue.push(resARR[num])
                        })
                    }
                    else
                        queue.push(resARR[num])
                }
            })
            writeStream( function () {
                if (!dontRef == 0)
                    dontRef = 1
                getBlock()
            })
        }
        else
            console.log(err)
    })
}

function checkBlock (transactions, callback) {
    var resARR = []
    for (t_num in transactions) {
        for(op_num in transactions[t_num].operations) {
            this_op = transactions[t_num].operations[op_num]            
            if (this_op[0] == "transfer" && this_op[1].to == config.username) {
                var inf = {
                    "username" : this_op[1].from,
                    "token" : "NULL",
                    "token_id" : 0,
                    "reward" : "0",
                    "log" : ""
                }
                var amount = this_op[1].amount.split(' ')
                if (parseFloat(amount[0]) >= 1) {
                    var memo = this_op[1].memo.toLowerCase()
                    inf.log = "does_not_exist"
                    for (token_num in claimdrops) {
                        var phrase = "$" + claimdrops[token_num].symbol.toLowerCase()
                        if (claimdrops[token_num].active == true) {
                            if (memo.includes(phrase)) {
                                inf.token_id = token_num
                                inf.token = claimdrops[token_num].symbol
                                currentDate = new Date()
                                endDate = new Date(claimdrops[token_num].end_date)
                                if (currentDate > endDate)
                                    inf.log = "time_over"
                                else
                                    inf.log = "eligible"
                            }
                        }
                    }
                }
                else
                    inf.log = "invalid_fee"
                resARR.push(inf)
            }
        }
    }
    callback(resARR)
}