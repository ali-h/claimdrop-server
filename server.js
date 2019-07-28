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
function writeCALL (call) {
    fs.appendFile('./database/calls.log', "\n" + JSON.stringify(call), function (err) {
        if (err)
            console.log(err)
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

    console.log('\x1b[36m%s\x1b[0m', "Server Started...")
    console.log("")
function getBlock() {
    if (!dontRef == 0) {
        streamInfo = JSON.parse(fs.readFileSync('./database/streamInfo.json', "utf-8"))
        claimdrops = JSON.parse(fs.readFileSync('./database/lists.json', "utf-8"))
    }
    steem.api.getBlock(++streamInfo.lastBlock, function(err, result) {
        if (!err) {
            process.stdout.write("\r" + "lastBlock - " + streamInfo.lastBlock)
            checkBlock(result.transactions, function(resARR) {
                for (num in resARR) {
                    if (resARR[num].log == "eligible") {
                        var list_name = claimdrops[resARR[num].token_id].file_name 
                        var list = fs.readFileSync('./files/' + list_name, "utf-8")
                        checkNameInList(list, resARR[num].username, list_name, function (res) {
                            if (res == false) {
                                resARR[num].log = "not_in_list"
                            }
                            else if (res == "already_claimed")
                                resARR[num].log = "already_claimed"
                            else
                                resARR[num].reward = res.reward
                            
                            console.log("\n" + "New Claim Call - ", "\tFROM : ", resARR[num].username, "\tLOG : ", resARR[num].log)
                            queue.push(resARR[num])
                            writeCALL(resARR[num])
                        })
                    }
                    else {
                        queue.push(resARR[num])
                        console.log("\n" + "New Claim Call - ", "\tFROM : ", resARR[num].username, "\tLOG : ", resARR[num].log)
                        writeCALL(resARR[num])
                    }
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
                var amount = this_op[1].amount.split(' ')
                var inf = {
                    "username" : this_op[1].from,
                    "token" : "NULL",
                    "token_id" : 0,
                    "reward" : "0",
                    "deposit" : this_op[1].amount,
                    "log" : ""
                }
                if (parseFloat(amount[0]) >= config.def_fee) {
                    var memo = this_op[1].memo.toUpperCase()
                    inf.log = "does_not_exist"
                    for (token_num in claimdrops) {
                        var phrase = "$" + claimdrops[token_num].symbol.toUpperCase()
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

function checkNameInList (list, username, list_name, callback) {
    var usersARR = list.split('\n')
    if (!usersARR[0] == "") {
        for (index in usersARR) {
            if (!usersARR[index] == "") {
                var this_user = usersARR[index].split(',')
                if (this_user[0] == username) {
                    res = {
                        "reward" : this_user[1].replace("\r", "")
                    }
                    var newList = list.replace(username+','+this_user[1], username+'(c),'+this_user[1])
                    fs.writeFile('./files/' + list_name, newList, function (err) {
                        callback(res)                        
                    })
                    return
                }
                else if (this_user[0] == username+'(c)') {
                    callback('already_claimed')
                    return
                }
            }
        }
        callback(false)
    }
    else
        callback (false)
}
function checkQueue() {
    if (queue.length > 0) {
        for (queue_num in queue) {
            if (queue[queue_num].log == "eligible") {
                var drop = claimdrops[queue[queue_num].token_id]
                var jsonARR = []                
                if (drop.type == "stake") {
                    if (drop.transfer_type == "issue") {
                        var localJSON = {
                            "contractName":"tokens",
                            "contractAction":"issue",
                            "contractPayload":{
                                "symbol": drop.symbol,
                                "to": drop.username,
                                "quantity": queue[queue_num].reward
                            }
                        }
                        jsonARR.push(localJSON)
                    }
                    var localJSON = {
                        "contractName":"tokens",
                        "contractAction":"delegate",
                        "contractPayload":{
                            "symbol": drop.symbol,
                            "to": queue[queue_num].username,
                            "quantity": queue[queue_num].reward
                        }
                    }
                    jsonARR.push(localJSON)
                }
                else if (drop.type == "liquid") {
                    var localJSON = {
                        "contractName":"tokens",
                        "contractAction":"transfer",
                        "contractPayload":{
                            "symbol": drop.symbol,
                            "to": queue[queue_num].username,
                            "quantity": queue[queue_num].reward
                        }
                    }
                    if (drop.transfer_type == "issue") {
                        localJSON.contractAction = "issue"
                    }
                    else if (drop.transfer_type == "transfer") {
                        localJSON.contractPayload["memo"] = drop.memo
                    }
                    jsonARR.push(localJSON)
                }
                doJson(jsonARR, queue[queue_num].token_id)
            }
            else
                refund(queue[queue_num])
        }
    }
    else
    setTimeout(function() { checkQueue() }, 1000)
}

checkQueue()

function refund(data) {
    steem.broadcast.transfer(config.keys.active, 
        config.username, data.username, 
        data.deposit, 
        config.memos[data.log], function(err, result) {
        if (err)
            console.log(err)
    })
}

function doJson(json, id) {
    steem.broadcast.customJson(
        claimdrops[id].keys.active, 
        [claimdrops[id].username], [], 
        "ssc-mainnet1", 
        JSON.stringify(json),
        function(err, result) {
            if (err) {
                console.log(err)
            }
    })
}
