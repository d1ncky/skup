const TelegramBot = require('node-telegram-bot-api');
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./config.json"));
const bot = new TelegramBot(config.token, {polling: true});
const axios = require("axios");
const httpsProxyAgent = require('https-proxy-agent');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const scriptstart = Date.now();
async function check(code) {
    for(let i = 0; config.proxy.length > i; i++) {
        const httpsAgent = new httpsProxyAgent(config.proxy[i]);
        let ret = 0;
        let data = await axios.get("https://discordapp.com/api/v9/entitlements/gift-codes/" + code, { httpsAgent }).catch(e => {
        if (!e.response) return;
        if (e.response.data.message == "Unknown Gift Code") ret = 1; 
        });
        if (ret == 1) return;
        if (data) {
            if (data.data) {
                if (data.data.uses == 0) {
                    return {
                        type: data.data.store_listing.sku.name,
                        gift: "https://discord.gift/" + data.data.code
                    };
                } else {
                    return;
                }
            } else {
                return;
            }
        }
    }
}
bot.on('message', async (msg) => {
    if(scriptstart+1000 > Date.now()) return;
    let users = JSON.parse(fs.readFileSync("./users.json"));
    if (msg.text == "/start") {
        if (!users[msg.chat.id.toString()]) {
            users[msg.chat.id.toString()] = {
                id: msg.chat.id,
                username: msg.from.first_name,
                balance: 0,
                sold: 0,
                check: 0,
                withdrawn: 0,
                nitrosold: [],
                wait: {},
                with_data: {}
            };
        }
        bot.sendMessage(msg.chat.id, "Бот по скупке Discord Nitro", {
            reply_markup: JSON.stringify({
                inline_keyboard: config.admins.find(e => e == msg.chat.id) ? [
                    [{ text: '🚀 Продать гифты', callback_data: 'sell' }],
                    [{ text: '👤 Профиль', callback_data: 'profile' }, { text: '📄 FAQ', callback_data: 'faq' }],
                    [{ text: '🤖 Админ панель', callback_data: 'admin' }],
                ] : [
                    [{ text: '🚀 Продать гифты', callback_data: 'sell' }],
                    [{ text: '👤 Профиль', callback_data: 'profile' }, { text: '📄 FAQ', callback_data: 'faq' }]
                ]
            })
        })
    } else {
        if (users[msg.chat.id.toString()].wait.withdrawn) {
            const sum = parseFloat(msg.text.replace(/\D/g, ''));
            if (sum > users[msg.chat.id.toString()].balance) {
                await bot.deleteMessage(msg.chat.id, msg.message_id);
                return await bot.editMessageText("❌ Заявка на вывод <b>" + sum + " руб.</b> не может быть создана!\nПричина: <i>Сумма не может быть больше имеющегося баланса</i>", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.withdrawn,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'profile' }],
                        ]
                    })
                });
            }
            let withdrawn = JSON.parse(fs.readFileSync("./withdrawn.json"));
            withdrawn.push({
                wid: Date.now().toString().split('').slice(7, 13).join(""),
                id: msg.chat.id,
                sum: sum,
                status: "created",
                system: users[msg.chat.id.toString()].with_data.system,
                number: users[msg.chat.id.toString()].with_data.number
            });
            fs.writeFileSync("./withdrawn.json", JSON.stringify(withdrawn));
            await bot.editMessageText("💰 Заявка на вывод <b>" + sum + " руб.</b> создана!", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.withdrawn,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'profile' }],
                    ]
                })
            });
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            users[msg.chat.id.toString()].balance -= sum;
            users[msg.chat.id.toString()].wait.withdrawn = null;
        } else if (users[msg.chat.id.toString()].wait.with_data) {
            const data = msg.text;
            users[msg.chat.id.toString()].with_data.number = data;
            await bot.editMessageText("💰 Данные для вывода успешно заполнены!", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.with_data,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'profile' }],
                    ]
                })
            });
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            users[msg.chat.id.toString()].wait.with_data = null;
        } else if (users[msg.chat.id.toString()].wait.sellgift) {
            const data = msg.text;
            let allgifts = data.split("\n");
            let gifts = [...new Set(allgifts)];
            let dubles = allgifts.length - gifts.length;
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            await bot.editMessageText("✅ Гифты получены. Удалено <b>"+ dubles +" дублей</b>!", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.sellgift,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'sell' }],
                    ]
                })
            });
            let checkedgifts = [];
            let giftcount = JSON.parse(fs.readFileSync("./giftcount.json"));
            let price = 0;
            let giftdb = JSON.parse(fs.readFileSync("./gifts.json"));
            for (let i = 0; gifts.length > i; i++) {
                let checked = await check(gifts[i].split('/')[3]);
                if (checked) {
                    if (giftdb.find(e => e.gift == checked.gift)) {
                        
                    } else if (checked.type == "Nitro Basic") {
                        if (giftcount.basic != 0) {
                            checked.sum = config.giftprice.basicm;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.basicm
                            giftcount.basic -= 1;
                        }
                    } else if (checked.type == "Nitro") {
                        if (giftcount.monthly != 0) {
                            checked.sum = config.giftprice.fullm;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.fullm
                            giftcount.monthly -= 1;
                        }
                    } else if (checked.type == "Nitro Classic") {
                        if (giftcount.classic != 0) {
                            checked.sum = config.giftprice.classicm;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.classicm
                            giftcount.classic -= 1;
                        }
                    } else if (checked.type == "Nitro Year") {
                        if (giftcount.classic != 0) {
                            checked.sum = config.giftprice.fully;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.fully
                            giftcount.yearly -= 1;
                        }
                    } else if (checked.type == "Nitro Classic Year") {
                        if (giftcount.classic != 0) {
                            checked.sum = config.giftprice.classicy;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.classicy
                            giftcount.classicyearly -= 1;
                        }
                    } else if (checked.type == "Nitro Basic Year") {
                        if (giftcount.classic != 0) {
                            checked.sum = config.giftprice.basicy;
                            checked.gid = Date.now().toString().split('').slice(7, 13).join("");
                            checkedgifts.push(checked);
                            price += config.giftprice.basicy
                            giftcount.basicyearly -= 1;
                        }
                    }
                }
            }
            fs.writeFileSync("./giftcount.json", JSON.stringify(giftcount))
            if (checkedgifts.length == 0) {
                await bot.editMessageText("❌ Проверка на валидность закончена, нет <b>ниодного гифта</b> удовлетворяющих <b>требования к скупке</b>!", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.sellgift,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'sell' }],
                        ]
                    })
                });
                return users[msg.chat.id.toString()].wait.sellgift = null;
            }
            for(let i = 0; i < checkedgifts.length; i++) {
                giftdb.push({
                    type: checkedgifts[i].type,
                    gift: checkedgifts[i].gift,
                    sum: checkedgifts[i].sum,
                    gid: checkedgifts[i].gid,
                    id: msg.chat.id,
                    status: "sended"
                });
            }
            for(let i = 0; i < config.admins.length; i++) {
                bot.sendMessage(config.admins[i], "✅ Отправили гифты в количестве <b>" + checkedgifts.length + " шт</b>, на общую сумму <b>" + price + " руб.</b>", { parse_mode: "HTML" })
            }
            
            await bot.editMessageText("✅ Успешно\nВы успешно отправили <b>"+ checkedgifts.length +" нитро</b> на проверку!\n<i>В случае продажи всего товара после проверки вы получите <b>"+ price +" руб.</b></i>", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.sellgift,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'sell' }],
                    ]
                })
            });
            fs.writeFileSync("./gifts.json", JSON.stringify(giftdb))
            users[msg.chat.id.toString()].check += 1;
            users[msg.chat.id.toString()].wait.sellgift = null;
        } else if (users[msg.chat.id.toString()].wait.find) {
            const data = msg.text;
            if (!users[data]) {
                return bot.editMessageText("❌ Пользователь не найден", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.find,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'admin' }],
                        ]
                    })
                });
            } 
            let user = users[data];
            users[msg.chat.id.toString()].wait.userchatid = data;
            bot.editMessageText("<b>Профиль пользователя</b>\n\n👤 Айди: <code>"+ msg.chat.id +
                "</code>\n🪙 Баланс: <b>" + user.balance + 
                " руб.</b>\n🛒 Продано: <b>"+ user.sold +
                " шт.</b>\n💸 Выведено: <b>" + user.withdrawn + 
                " руб.</b>\n🚀 На продаже: <b>" + user.check + 
                " шт.</b>\n\n<b>Данные для вывода:</b>\n🤖 Платежная система: <b>" + (user.with_data.system ? user.with_data.system : "Не указана") + 
                "</b>\n📱 Номер кошелька: <b>" + (user.with_data.number ? user.with_data.number : "Не указан") + "</b>", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.find,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '💰 Сменить баланс', callback_data: 'changebalance' }],
                        [{ text: '⏪ Назад', callback_data: 'admin' }],
                    ]
                })
            });
            users[msg.chat.id.toString()].wait.find = null;
        } else if (users[msg.chat.id.toString()].wait.skup) {
            const data = msg.text;
            const code = data.split(':')[0];
            const count = parseInt(data.split(':')[1]);
            if (code == "FullMonth" || code == "BasicMonth" || code == "ClassicMonth" || code == "FullYearly" || code == "BasicYearly" || code == "ClassicYearly") {
                let giftcount = JSON.parse(fs.readFileSync("./giftcount.json"));
                if (code == "FullMonth") {
                    giftcount.monthly = count;
                } else if (code == "ClassicMonth") {
                    giftcount.classic = count;
                } else if (code == "BasicMonth") {
                    giftcount.basic = count;
                } else if (code == "FullYearly") {
                    giftcount.yearly = count;
                } else if (code == "ClassicYearly") {
                    giftcount.classicyearly = count;
                } else if (code == "BasicYearly") {
                    giftcount.basicyearly = count;
                }
                fs.writeFileSync("./giftcount.json", JSON.stringify(giftcount))
                bot.editMessageText("🛒 Товар <code>"+ code +"</code> был пополнен на <b>"+ count +" шт.</b>", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.skup,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'admin' }],
                        ]
                    })
                });
                await bot.deleteMessage(msg.chat.id, msg.message_id);
            } else {
                bot.editMessageText("🛒 Не удалось найти товар для <b>скупа по коду</b>", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.skup,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'admin' }],
                        ]
                    })
                });
            }
        } else if (users[msg.chat.id.toString()].wait.senduser) {
            const data = msg.text;
            const user = data.split("\n")[0];
            const message = data.split("\n").slice(1, data.split("\n").length).join("\n");
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            try {
                await bot.sendMessage(user, message, { reply_markup: { inline_keyboard: [[{text: "Это личное сообщение!", callback_data: "itsadm"}]] } });
                await bot.editMessageText("✅ Сообщение успешно отправлено", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.senduser,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'admin' }],
                        ]
                    })
                });
            } catch (err) {
                await bot.editMessageText("❌ Не удалось отправить сообщение пользователю!\n<i>Ошибка: <b>"+ err +"</b></i>", {
                    chat_id: msg.chat.id, 
                    message_id: users[msg.chat.id.toString()].wait.senduser,
                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({
                        inline_keyboard: [
                            [{ text: '⏪ Назад', callback_data: 'admin' }],
                        ]
                    })
                });
            }
        } else if (users[msg.chat.id.toString()].wait.sendall) {
            const message = msg.text;
            let arr = [];
            const keys = Object.keys(users);
            for (let i = 0; i < keys.length; i++) {
                arr.push(users[keys[i.toString()]]);
            }
            await bot.deleteMessage(msg.chat.id, msg.message_id);
            let s = 1;
            for (let i = 0; i < arr.length; i++) {
                try {
                    await bot.sendMessage(arr[i].id, message, { reply_markup: { inline_keyboard: [[{text: "Это рассылка!", callback_data: "itsaads"}]] } });
                    await bot.editMessageText("✅ Сообщение успешно отправлено ("+ s +"/"+ arr.length +")", {
                        chat_id: msg.chat.id, 
                        message_id: users[msg.chat.id.toString()].wait.sendall,
                        parse_mode: "HTML",
                        reply_markup: JSON.stringify({
                            inline_keyboard: [
                                [{ text: '⏪ Назад', callback_data: 'admin' }],
                            ]
                        })
                    });
                    s++;
                } catch (err) {}
            }
            
        } else if (users[msg.chat.id.toString()].wait.changebalance) {
            const sum = parseFloat(msg.text.replace(/\D/g, ''));
            users[users[msg.chat.id.toString()].wait.userchatid].balance = sum;
            await bot.editMessageText("✅ Баланс успешно изменен!", {
                chat_id: msg.chat.id, 
                message_id: users[msg.chat.id.toString()].wait.changebalance,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'admin' }],
                    ]
                })
            });
            
            
        }
    }
    fs.writeFileSync("./users.json", JSON.stringify(users));
});
bot.on("polling_error", console.log);
bot.on('callback_query', async (action) => {
    if(scriptstart+1000 > Date.now()) return;
    let users = JSON.parse(fs.readFileSync("./users.json"));
    if (action.data == "profile") {
        users[action.message.chat.id.toString()].wait = {};
        let user = users[action.message.chat.id.toString()];
        bot.editMessageText("<b>Ваш профиль в боте</b>\n\n👤 Айди: <code>"+ action.message.chat.id +
            "</code>\n🪙 Баланс: <b>" + user.balance + 
            " руб.</b>\n🛒 Продано: <b>"+ user.sold +
            " шт.</b>\n💸 Выведено: <b>" + user.withdrawn + 
            " руб.</b>\n🚀 На продаже: <b>" + user.check + 
            " шт.</b>\n\n<b>Данные для вывода:</b>\n🤖 Платежная система: <b>" + (user.with_data.system ? user.with_data.system : "Не указана") + 
            "</b>\n📱 Номер кошелька: <b>" + (user.with_data.number ? user.with_data.number : "Не указан") + "</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '💰 Вывести', callback_data: 'withdrawn' }, { text: '🏦 Ваши выводы', callback_data: 'withdrawns' }],
                    [{ text: '💸 Ввести данные для вывода', callback_data: 'wallet' }],
                    [{ text: '⏪ Назад', callback_data: 'main' }],
                ]
            })
        });
    } else if (action.data == "main") {
        bot.editMessageText("Бот по скупке Discord Nitro", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            reply_markup: JSON.stringify({
                inline_keyboard: config.admins.find(e => e == action.message.chat.id) ? [
                    [{ text: '🚀 Продать гифты', callback_data: 'sell' }],
                    [{ text: '👤 Профиль', callback_data: 'profile' }, { text: '📄 FAQ', callback_data: 'faq' }],
                    [{ text: '🤖 Админ панель', callback_data: 'admin' }],
                ] : [
                    [{ text: '🚀 Продать гифты', callback_data: 'sell' }],
                    [{ text: '👤 Профиль', callback_data: 'profile' }, { text: '📄 FAQ', callback_data: 'faq' }]
                ]
            })
        })
    } else if (action.data == "withdrawn") {
        let user = users[action.message.chat.id.toString()];
        if (user.balance < 10) {
            return bot.editMessageText("Вывод доступен от <b>" + config.min + " руб.</b>", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '⏪ Назад', callback_data: 'profile' }],
                    ]
                })
            });
        } else if (!user.with_data.number) {
            return bot.editMessageText("Вы не вввели данные для вывода средств!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: '💸 Ввести данные для вывода', callback_data: 'wallet' }],
                        [{ text: '⏪ Назад', callback_data: 'profile' }],
                    ]
                })
            });
        }
        bot.editMessageText("🤑 Укажите <b>сумму</b> вывода", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'profile' }],
                ]
            })
        });
        users[action.message.chat.id.toString()].wait.withdrawn = action.message.message_id;
    } else if (action.data == "wallet") {
        bot.editMessageText("Выберите способ вывода, используя кнопки <b>ниже</b>!", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: 'Карта', callback_data: 'card' }, { text: 'Qiwi', callback_data: 'qiwi' }, { text: 'Lava', callback_data: 'lava' }],
                    [{ text: '⏪ Назад', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "card") {
        users[action.message.chat.id.toString()].with_data.system = "Карта";
        users[action.message.chat.id.toString()].wait.with_data = action.message.message_id;
        bot.editMessageText("Отправьте сообщением ниже номер своей <b>банковской карты</b>!", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "qiwi") {
        users[action.message.chat.id.toString()].with_data.system = "Qiwi";
        users[action.message.chat.id.toString()].wait.with_data = action.message.message_id;
        bot.editMessageText("Отправьте сообщением ниже номер <b>киви</b>!", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "lava") {
        users[action.message.chat.id.toString()].with_data.system = "Lava";
        users[action.message.chat.id.toString()].wait.with_data = action.message.message_id;
        bot.editMessageText("Отправьте сообщением ниже номер своего <b>Lava кошелька</b>!", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "withdrawns") {
        users[action.message.chat.id.toString()].wait.withdrawn_list = 0;
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].id == action.message.chat.id) {
                all.push(withdrawns[i]);
            }
        }
        all.reverse();
        if (all.length == 0) {
            return bot.editMessageText("❌ Вы еще не выводили деньги с бота!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в профиль', callback_data: 'profile' }],
                    ]
                })
            });
        }
        let my = all.slice(users[action.message.chat.id.toString()].wait.withdrawn_list, users[action.message.chat.id.toString()].wait.withdrawn_list+5);
        let text = [];
        for(let i = 0; my.length > i; i++) {
            text.push("🪪 <b>Транзакция #"+ i +"</b>\n💰 Сумма к выводу: <b>" + my[i].sum + " руб.</b>\n🚦 Статус: <b>" + (my[i].status == "created" ? "🕝 Создан" : (my[i].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>")
        }
        bot.editMessageText(text.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        (users[action.message.chat.id.toString()].wait.withdrawn_list != 0 ? { text: '⏪ Назад', callback_data: 'back_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.withdrawn_list+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' })],
                    [{ text: 'Обратно в профиль', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "back_withdrawn") {
        users[action.message.chat.id.toString()].wait.withdrawn_list -= 1;
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].id == action.message.chat.id) {
                all.push(withdrawns[i]);
            }
        }
        all.reverse();
        let my = all.slice(users[action.message.chat.id.toString()].wait.withdrawn_list*5, users[action.message.chat.id.toString()].wait.withdrawn_list*5+5);let text = [];
        for(let i = 0; my.length > i; i++) {
            text.push("🪪 <b>Транзакция #"+ (i+(5*users[action.message.chat.id.toString()].wait.withdrawn_list)) +"</b>\n💰 Сумма к выводу: <b>" + my[i].sum + " руб.</b>\n🚦 Статус: <b>" + (my[i].status == "created" ? "🕝 Создан" : (my[i].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>")
        }
        bot.editMessageText(text.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        (users[action.message.chat.id.toString()].wait.withdrawn_list != 0 ? { text: '⏪ Назад', callback_data: 'back_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.withdrawn_list+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' })],
                    [{ text: 'Обратно в профиль', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "next_withdrawn") {
        users[action.message.chat.id.toString()].wait.withdrawn_list += 1;
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].id == action.message.chat.id) {
                all.push(withdrawns[i]);
            }
        }
        all.reverse();
        let my = all.slice(users[action.message.chat.id.toString()].wait.withdrawn_list*5, users[action.message.chat.id.toString()].wait.withdrawn_list*5+5);
        let text = [];
        for(let i = 0; my.length > i; i++) {
            text.push("🪪 <b>Транзакция #"+ (i+(5*users[action.message.chat.id.toString()].wait.withdrawn_list)) +"</b>\n💰 Сумма к выводу: <b>" + my[i].sum + " руб.</b>\n🚦 Статус: <b>" + (my[i].status == "created" ? "🕝 Создан" : (my[i].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>")
        }
        bot.editMessageText(text.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        (users[action.message.chat.id.toString()].wait.withdrawn_list != 0 ? { text: '⏪ Назад', callback_data: 'back_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.withdrawn_list*5+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_withdrawn' } : { text: '⠀', callback_data: 'fsgfas' })],
                    [{ text: 'Обратно в профиль', callback_data: 'profile' }],
                ]
            })
        });
    } else if (action.data == "sell") {
        users[action.message.chat.id.toString()].wait = {};
        let nitro = JSON.parse(fs.readFileSync("./giftcount.json"))
        bot.editMessageText("🛒 <b>Доступно к продаже:</b>\n\nNitro Monthly - <b>" + nitro.monthly + " шт.</b> | <b>"+ config.giftprice.fullm +" руб.</b>\nNitro Classic Monthly - <b>" + nitro.classic + " шт.</b> | <b>"+ config.giftprice.classicm +" руб.</b>\nNitro Basic Monthly - <b>" + nitro.basic + " шт.</b> | <b>"+ config.giftprice.basicm +" руб.</b>\n\nNitro Yearly - <b>" + nitro.yearly + " шт.</b> | <b>"+ config.giftprice.fully +" руб.</b>\nNitro Classic Yearly - <b>" + nitro.classicyearly + " шт.</b> | <b>"+ config.giftprice.classicy +" руб.</b>\nNitro Basic Yearly - <b>" + nitro.basicyearly + " шт.</b> | <b>"+ config.giftprice.basicy +" руб.</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '🚀 Продать', callback_data: 'sellgift' }],
                    [{ text: '⏪ Назад', callback_data: 'main' }],
                ]
            })
        });
    } else if (action.data == "sellgift") {
        users[action.message.chat.id.toString()].wait.sellgift = action.message.message_id;
        bot.editMessageText("Дабы продать гифты отправьте их <b>следующим сообщением</b> по такой <b>форме</b>\n\n🚀 <code>https://discord.gift/%{giftcode}</code>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'sell' }],
                ]
            })
        });
    } else if (action.data == "admin") {
        users[action.message.chat.id.toString()].wait = {};
        bot.editMessageText("<b>Добро пожаловать в админ-панель!</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: '💰 Выплаты', callback_data: 'check_withdrawn'}, 
                        { text: '🚀 Гифты', callback_data: 'check_gift' }
                    ],
                    [
                        { text: '💸 Пополнить скуп', callback_data: 'addskup' }, 
                        { text: '📊 Статистика', callback_data: 'stats' }
                    ],
                    [
                        { text: '👤 Найти пользователя', callback_data: 'find'}
                    ],
                    [
                        { text: '🗣️ Сообщение юзеру', callback_data: 'senduser' }, 
                        { text: '👥 Сообщение всем', callback_data: 'sendall' }
                    ],
                    [
                        { text: '⏪ Назад', callback_data: 'main' }
                    ],
                ]
            })
        });
    } else if (action.data == "check_withdrawn") {
        users[action.message.chat.id.toString()].wait.admin_withdrawn_list = {
            page: 0,
            user: null,
        };
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].status == "created") {
                all.push(withdrawns[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету активных выводов!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }
        let my = all.slice(page, page+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].wid, callback_data: "WD" + my[i].wid});
            text1.push("<b>🏦 Платеж #" + my[i].wid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n💸 Сумма: <b>" + my[i].sum + " руб.</b>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_awithdrawn' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_awithdrawn' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
        
    } else if (action.data == "next_awithdrawn") {
        users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page += 1;
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].status == "created") {
                all.push(withdrawns[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету активных выводов!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }

        let my = all.slice(page*5, page*5+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].wid, callback_data: "WD" + my[i].wid});
            text1.push("<b>🏦 Платеж #" + my[i].wid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n💸 Сумма: <b>" + my[i].sum + " руб.</b>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_awithdrawn' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page*5+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_awithdrawn' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
        
    } else if (action.data == "back_awithdrawn") {
        users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page -= 1;
        const withdrawns = JSON.parse(fs.readFileSync("./withdrawn.json"));
        let all = [];
        for(let i = 0; withdrawns.length > i; i++) {
            if (withdrawns[i].status == "created") {
                all.push(withdrawns[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету активных выводов!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }

        let my = all.slice(page*5, page*5+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].wid, callback_data: "WD" + my[i].wid});
            text1.push("<b>🏦 Платеж #" + my[i].wid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n💸 Сумма: <b>" + my[i].sum + " руб.</b>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_awithdrawn' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_withdrawn_list.page*5+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_awithdrawn' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
        
    } else if (action.data.startsWith("WD")) {
        let withdrawns = JSON.parse(fs.readFileSync('./withdrawn.json'));
        let id;
        let wid = action.data.replace("WD", "");
        for (let i = 0; i < withdrawns.length; i++) {
            if (withdrawns[i].wid.toString() == wid) id = i;
        }
        users[action.message.chat.id.toString()].wait.admin_withdrawn_list.id = withdrawns[id].wid;
        let user = users[withdrawns[id].id.toString()];
        bot.editMessageText("<b>🏦 Платеж #" + wid + "</b>\n\n👤 Пользователь: <code>"+ user.username +"</code>\n👨🏻‍💻 Айди: <code>"+ user.id +"</code>\n💸 Сумма: <b>"+ withdrawns[id].sum +" руб.</b>\n🚦 Статус: <b>" + (withdrawns[id].status == "created" ? "🕝 Создан" : (withdrawns[id].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>\n\n<b>Реквизиты:</b>\n🤖 Платежная система: <b>" + user.with_data.system + "</b>\n📱 Номер: <b>" + user.with_data.number + "</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: '✅', callback_data: 'success' },
                        { text: '❌', callback_data: 'cancel' }
                    ],
                    [
                        { text: 'Обратно', callback_data: 'check_withdrawn' }
                    ],
                ]
            })
        });

    } else if (action.data == "success") {
        let withdrawns = JSON.parse(fs.readFileSync('./withdrawn.json'));
        let id;
        for (let i = 0; i < withdrawns.length; i++) {
            if (withdrawns[i].wid == users[action.message.chat.id.toString()].wait.admin_withdrawn_list.id) { id = i; }
        }
        withdrawns[id].status = "success";
        bot.sendMessage(withdrawns[id].id, "✅ Выплата #" + withdrawns[id].wid + " была произведена одним из администраторов!\n\n<i>Сумма с небольшой комиссией поступила на ваши реквизиты</i>", {parse_mode: "HTML"})
        users[withdrawns[id].id.toString()].withdrawn += withdrawns[id].sum;
        fs.writeFileSync("./withdrawn.json", JSON.stringify(withdrawns));
        let user = users[withdrawns[id].id.toString()];
        bot.editMessageText("<b>🏦 Платеж #" + withdrawns[id].wid + "</b>\n\n👤 Пользователь: <code>"+ user.username +"</code>\n👨🏻‍💻 Айди: <code>"+ user.id +"</code>\n💸 Сумма: <b>"+ withdrawns[id].sum +" руб.</b>\n🚦 Статус: <b>" + (withdrawns[id].status == "created" ? "🕝 Создан" : (withdrawns[id].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>\n\n<b>Реквизиты:</b>\n🤖 Платежная система: <b>" + user.with_data.system + "</b>\n📱 Номер: <b>" + user.with_data.number + "</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: 'Обратно', callback_data: 'check_withdrawn' }
                    ],
                ]
            })
        });
    } else if (action.data == "cancel") {
        let withdrawns = JSON.parse(fs.readFileSync('./withdrawn.json'));
        let id;
        for (let i = 0; i < withdrawns.length; i++) {
            if (withdrawns[i].wid == users[action.message.chat.id.toString()].wait.admin_withdrawn_list.id) { id = i; }
        }
        withdrawns[id].status = "canceled";
        bot.sendMessage(withdrawns[id].id, "❌ Выплата #" + withdrawns[id].wid + " была отменена одним из администраторов!\n\n<i>Баланс был возвращен</i>", {parse_mode: "HTML"})
        users[action.message.chat.id.toString()].wait.admin_withdrawn_list.id = withdrawns[id].id;
        users[withdrawns[id].id.toString()].balance += withdrawns[id].sum
        fs.writeFileSync("./withdrawn.json", JSON.stringify(withdrawns));
        let user = users[withdrawns[id].id.toString()];
        bot.editMessageText("<b>🏦 Платеж #" + withdrawns[id].wid + "</b>\n\n👤 Пользователь: <code>"+ user.username +"</code>\n👨🏻‍💻 Айди: <code>"+ user.id +"</code>\n💸 Сумма: <b>"+ withdrawns[id].sum +" руб.</b>\n🚦 Статус: <b>" + (withdrawns[id].status == "created" ? "🕝 Создан" : (withdrawns[id].status == "success" ? "✅ Выведено" : "❌ Отклонен")) + "</b>\n\n<b>Реквизиты:</b>\n🤖 Платежная система: <b>" + user.with_data.system + "</b>\n📱 Номер: <b>" + user.with_data.number + "</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: 'Обратно', callback_data: 'check_withdrawn' }
                    ],
                ]
            })
        });
    } else if (action.data == "check_gift") {
        users[action.message.chat.id.toString()].wait.admin_gift_list = {
            page: 0,
            user: null,
        };
        const gifts = JSON.parse(fs.readFileSync("./gifts.json"));
        let all = [];
        for(let i = 0; gifts.length > i; i++) {
            if (gifts[i].status == "sended") {
                all.push(gifts[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_gift_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету гифтов в боте!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }
        let my = all.slice(page, page+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].gid, callback_data: "GF" + my[i].gid});
            text1.push("<b>🏦 Гифт #" + my[i].gid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n🚀 Гифт: <code>" + my[i].gift + "</code>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_gift' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_gift' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
    } else if (action.data == "back_gift") {
        users[action.message.chat.id.toString()].wait.admin_gift_list.page -= 1;
        const gifts = JSON.parse(fs.readFileSync("./gifts.json"));
        let all = [];
        for(let i = 0; gifts.length > i; i++) {
            if (gifts[i].status == "sended") {
                all.push(gifts[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_gift_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету активных гифтов!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }

        let my = all.slice(page*5, page*5+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].gid, callback_data: "GF" + my[i].gid});
            text1.push("<b>🏦 Гифт #" + my[i].gid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n🚀 Гифт: <code>" + my[i].gift + "</code>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_gift' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page*5+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_gift' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
    } else if (action.data == "next_gift") {
        users[action.message.chat.id.toString()].wait.admin_gift_list.page += 1;
        const gifts = JSON.parse(fs.readFileSync("./gifts.json"));
        let all = [];
        for(let i = 0; gifts.length > i; i++) {
            if (gifts[i].status == "sended") {
                all.push(gifts[i]);
            }
        }
        let page = users[action.message.chat.id.toString()].wait.admin_gift_list.page;
        if (all.length == 0) {
            return bot.editMessageText("❌ Сейчас нету активных гифтов!", {
                chat_id: action.message.chat.id, 
                message_id: action.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    inline_keyboard: [
                        [{ text: 'Обратно в админ панель', callback_data: 'admin' }],
                    ]
                })
            });
        }

        let my = all.slice(page*5, page*5+5);
        let text = [];
        let text1 = [];
        for(let i = 0; my.length > i; i++) {
            text.push({ text: my[i].gid, callback_data: "GF" + my[i].gid});
            text1.push("<b>🏦 Гифт #" + my[i].gid + "</b>\n👤 ID: <code>" + my[i].id + "</code>\n🚀 Гифт: <code>" + my[i].gift + "</code>")
        }
        bot.editMessageText(text1.join("\n\n"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    text,
                    [
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page != 0 ? { text: '⏪ Назад', callback_data: 'back_gift' } : { text: '', callback_data: 'fsgfas' }),
                        (users[action.message.chat.id.toString()].wait.admin_gift_list.page*5+5 <= all.length ? { text: 'Вперед ⏩', callback_data: 'next_gift' } : { text: '', callback_data: 'fsgfas' })
                    ],
                    [
                        { text: 'Обратно в админ панель', callback_data: 'admin' }
                    ],
                ]
            })
        });
    } else if (action.data.startsWith("GF")) {
        let gifts = JSON.parse(fs.readFileSync('./gifts.json'));
        let id;
        let gid = action.data.replace("GF", "");
        for (let i = 0; i < gifts.length; i++) {
            if (gifts[i].gid.toString() == gid) id = i;
        }
        console.log(id)
        users[action.message.chat.id.toString()].wait.admin_gift_list.id = gifts[id].gid;
        let user = users[gifts[id].id.toString()];
        console.log("Pon")
        let checker = await check(gifts[id].gift.replace("https://discord.gift/", ""));
        console.log("checker1")
        bot.editMessageText("<b>🏦 Гифт #" + gid + "</b>\n\n👤 Пользователь: <code>"+ user.username +
        "</code>\n👨🏻‍💻 Айди: <code>"+ user.id +
        "</code>\n🚀 Гифт: <b>"+ gifts[id].gift +
        "</b>\n🚦 Статус: <b>" + (gifts[id].status == "sended" ? "🚀 Отправлен" : gifts[id].status == "success" ? "✅ Принят" : "❌ Отклонен" ) + 
        "</b>\n🚀 Чекер: " + (checker ? "✅" : "❌"),
        {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: '✅', callback_data: 'gsuccess' },
                        { text: '❌', callback_data: 'gcancel' }
                    ],
                    [
                        { text: 'Обратно', callback_data: 'check_gift' }
                    ],
                ]
            })
        });

    } else if (action.data == "gsuccess") {
        let gifts = JSON.parse(fs.readFileSync('./gifts.json'));
        let id;
        for (let i = 0; i < gifts.length; i++) {
            if (gifts[i].gid == users[action.message.chat.id.toString()].wait.admin_gift_list.id) { id = i; }
        }
        gifts[id].status = "success";
        bot.sendMessage(gifts[id].id, "✅ Гифт #" + gifts[id].gid + " был проверен одним из администраторов!\n\n<i>Вам на баланс добавлена сумма в размере "+ gifts[id].sum +" руб.</i>", {parse_mode: "HTML"})
        users[gifts[id].id.toString()].balance += gifts[id].sum;
        users[gifts[id].id.toString()].sold += 1;
        users[gifts[id].id.toString()].check -= 1;
        fs.writeFileSync("./gifts.json", JSON.stringify(gifts));
        let user = users[gifts[id].id.toString()];
        let checker = await check(gifts[id].gift.replace("https://discord.gift/", ""))
        bot.editMessageText("<b>🏦 Гифт #" + gifts[id].gid + "</b>\n\n👤 Пользователь: <code>"+ user.username +
        "</code>\n👨🏻‍💻 Айди: <code>"+ user.id +
        "</code>\n🚀 Гифт: <b>"+ gifts[id].gift +
        "</b>\n🚦 Статус: <b>" + (gifts[id].status == "sended" ? "🚀 Отправлен" : gifts[id].status == "success" ? "✅ Принят" : "❌ Отклонен" ) + 
        "</b>\n🚀 Чекер: " + (checker ? "✅" : "❌"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: 'Обратно', callback_data: 'check_gift' }
                    ],
                ]
            })
        });
    } else if (action.data == "gcancel") {
        let gifts = JSON.parse(fs.readFileSync('./gifts.json'));
        let id;
        for (let i = 0; i < gifts.length; i++) {
            if (gifts[i].gid == users[action.message.chat.id.toString()].wait.admin_gift_list.id) { id = i; }
        }
        gifts[id].status = "cancelled";
        users[gifts[id].id.toString()].check -= 1;
        bot.sendMessage(gifts[id].id, "❌ Гифт #" + gifts[id].gid + " был проверен одним из администраторов!\n\n<i>К сожалению при проверке, он оказался невалидным!</i>", {parse_mode: "HTML"})
        fs.writeFileSync("./gifts.json", JSON.stringify(gifts));
        let user = users[gifts[id].id.toString()];
        let checker = await check(gifts[id].gift.replace("https://discord.gift/", ""))
        bot.editMessageText("<b>🏦 Гифт #" + gifts[id].gid + "</b>\n\n👤 Пользователь: <code>"+ user.username +
        "</code>\n👨🏻‍💻 Айди: <code>"+ user.id +
        "</code>\n🚀 Гифт: <b>"+ gifts[id].gift +
        "</b>\n🚦 Статус: <b>" + (gifts[id].status == "sended" ? "🚀 Отправлен" : gifts[id].status == "success" ? "✅ Принят" : "❌ Отклонен" ) + 
        "</b>\n🚀 Чекер: " + (checker ? "✅" : "❌"), {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [
                        { text: 'Обратно', callback_data: 'check_gift' }
                    ],
                ]
            })
        });
    } else if (action.data == "find") {
        users[action.message.chat.id.toString()].wait.find = action.message.message_id;
        bot.editMessageText("Отправьте индификатор пользователя следующим сообщением", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "addskup") {
        users[action.message.chat.id.toString()].wait.skup = action.message.message_id;
        bot.editMessageText("🛒 Дабы пополнить скуп введите данные в следующем формате:\n\n<code>FullMonth:50</code>\n\nКоды нитро: <b>BasicMonth, ClassicMonth, FullMonth, BasicYearly, ClassicYearly, FullYearly</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "stats") {
        let arr = [];
        const keys = Object.keys(users);
        for (let i = 0; i < keys.length; i++) {
            arr.push(users[keys[i.toString()]]);
        }
        let stats = {
            users: 0,
            balance: 0,
            sold: 0,
            check: 0,
            withdrawn: 0
        };
        for (let i = 0; i < arr.length; i++) {
            stats.users += 1;
            stats.balance += arr[i].balance
            stats.sold += arr[i].sold
            stats.check += arr[i].check
            stats.withdrawn += arr[i].withdrawn
        }
        bot.editMessageText("🛒 Статистика использования бота:\n\n👥 Пользователей: <b>"+ stats.users +" шт.</b>\n💰 Общий баланс: <b>"+ stats.balance +" руб.</b>\n🛒 Всего продали: <b>"+ stats.sold +" шт.</b>\n🚀 Нитро на проверке: <b>"+ stats.check +" шт.</b>\n💸 Всего выведено: <b>"+ stats.withdrawn +" руб.</b>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "senduser") {
        users[action.message.chat.id.toString()].wait.senduser = action.message.message_id;
        bot.editMessageText("🛒 Чтобы отправить сообщение пользователю напишите <b>по форме ниже</b>:\n\n<code>1234567890\nОчень крутое сообщение которое попадет пользователю выше</code>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "sendall") {
        users[action.message.chat.id.toString()].wait.sendall = action.message.message_id;
        bot.editMessageText("🛒 Чтобы отправить сообщение пользователям напишите <b>по форме ниже</b>:\n\n<code>Очень крутое сообщение которое попадет пользователю выше</code>", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "changebalance") {
        users[action.message.chat.id.toString()].wait.changebalance = action.message.message_id;
        bot.editMessageText("🛒 Введите новый баланс для пользователя", {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'admin' }],
                ]
            })
        });
    } else if (action.data == "faq") {
        bot.editMessageText(config.faq, {
            chat_id: action.message.chat.id, 
            message_id: action.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
                inline_keyboard: [
                    [{ text: '⏪ Назад', callback_data: 'main' }],
                ]
            })
        });
    }
    fs.writeFileSync("./users.json", JSON.stringify(users));
}
);
console.log("Бот запущен")