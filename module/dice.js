export class WwnDice {
  static digestResult(data, roll) {
    let result = {
      isSuccess: false,
      isFailure: false,
      target: data.roll.target,
      total: roll.total,
    };

    let die = roll.terms[0].total;
    if (data.roll.type == "above") {
      // SAVING THROWS
      if (roll.total >= result.target) {
        result.isSuccess = true;
      } else {
        result.isFailure = true;
      }
    } else if (data.roll.type == "below") {
      // MORALE, EXPLORATION
      if (roll.total <= result.target) {
        result.isSuccess = true;
      } else {
        result.isFailure = true;
      }
    } else if (data.roll.type == "check") {
      // SCORE CHECKS (1s and 20s)
      if (die == 1 || (roll.total <= result.target && die < 20)) {
        result.isSuccess = true;
      } else {
        result.isFailure = true;
      }
    } else if (data.roll.type == "skill") {
    } else if (data.roll.type == "table") {
      // Reaction
      let table = data.roll.table;
      let output = "";
      for (let i = 0; i <= roll.total; i++) {
        if (table[i]) {
          output = table[i];
        }
      }
      result.details = output;
    } else if (data.roll.type == "instinct") {
      // SAVING THROWS
      if (roll.total >= result.target) {
        result.isSuccess = true;
      } else {
        result.isFailure = true;
        // Pull result from linked instinct table
        const iL = data.actor.system.details.instinctTable.table;
        // RegEx expression to chop up iL into the chunks needed
        const pattern = /\[(.+)\.([\w]+)\]/;
        const iA = iL.match(pattern);
        const pack = game.packs.get(iA[1]);
        if ( game.settings.get("wwn", "hideInstinct") ) {
          pack.getDocument(iA[2]).then(table => table.draw({rollMode: "gmroll"}));
        } else {
          pack.getDocument(iA[2]).then(table => table.draw());
        }
      }
    }
    return result;
  }

  static async sendRoll({
    parts = [],
    data = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
    rollTitle = null
  } = {}) {
    const template = "systems/wwn/templates/chat/roll-result.html";

    let chatData = {
      user: game.user.id,
      speaker: speaker,
    };

    const templateData = {
      title: title,
      flavor: flavor,
      data: data,
      rollTitle: rollTitle
    };

    // Optionally include a situational bonus
    if (form !== null && form.bonus.value) {
      parts.push(form.bonus.value);
    }

    const roll = new Roll(parts.join("+"), data).roll({async: false});

    // Convert the roll to a chat message and return the roll
    let rollMode = game.settings.get("core", "rollMode");
    rollMode = form ? form.rollMode.value : rollMode;

    // Force blind roll (art formulas)
    if (data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode))
      chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];
    if (rollMode === "blindroll") {
      chatData["blind"] = true;
      data.roll.blindroll = true;
    }

    templateData.result = WwnDice.digestResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollWWN = r;
        renderTemplate(template, templateData).then((content) => {
          chatData.content = content;
          // Dice So Nice
          if (game.dice3d) {
            game.dice3d
              .showForRoll(
                roll,
                game.user,
                true,
                chatData.whisper,
                chatData.blind
              )
              .then((displayed) => {
                ChatMessage.create(chatData);
                resolve(roll);
              });
          } else {
            chatData.sound = CONFIG.sounds.dice;
            ChatMessage.create(chatData);
            resolve(roll);
          }
        });
      });
    });
  }

  static digestAttackResult(data, roll) {
    let result = {
      isSuccess: false,
      isFailure: false,
      target: "",
      total: roll.total,
    };
    result.target = data.roll.thac0;
    const targetAac = data.roll.target
      ? data.roll.target.actor.system.aac.value
      : 0;
    result.victim = data.roll.target ? data.roll.target.data.name : null;

    if (roll.total < targetAac) {
      result.details = game.i18n.format(
        "WWN.messages.AttackAscendingFailure",
        {
          bonus: result.target,
        }
      );
      return result;
      }
      result.details = game.i18n.format("WWN.messages.AttackAscendingSuccess", {
        result: roll.total,
      });
      result.isSuccess = true;

    return result;
  }

  static async sendAttackRoll({
    parts = [],
    data = {},
    title = null,
    flavor = null,
    speaker = null,
    form = null,
    rollTitle = null,
    dmgTitle = null
  } = {}) {
    const template = "systems/wwn/templates/chat/roll-attack.html";

    let chatData = {
      user: game.user.id,
      speaker: speaker,
    };

    let templateData = {
      title: title,
      flavor: flavor,
      data: data,
      config: CONFIG.WWN,
      rollTitle: rollTitle,
      dmgTitle: dmgTitle
    };

    // Optionally include a situational bonus
    if (form !== null && form.bonus.value) parts.push(form.bonus.value);

    const roll = new Roll(parts.join("+"), data).roll({async: false});
    const dmgRoll = new Roll(data.roll.dmg.join("+"), data).roll({async: false});

    // Convert the roll to a chat message and return the roll
    let rollMode = game.settings.get("core", "rollMode");
    rollMode = form ? form.rollMode.value : rollMode;

    // Force blind roll (art formulas)
    if (data.roll.blindroll) {
      rollMode = game.user.isGM ? "selfroll" : "blindroll";
    }

    if (["gmroll", "blindroll"].includes(rollMode))
      chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];
    if (rollMode === "blindroll") {
      chatData["blind"] = true;
      data.roll.blindroll = true;
    }

    templateData.result = WwnDice.digestAttackResult(data, roll);

    return new Promise((resolve) => {
      roll.render().then((r) => {
        templateData.rollWWN = r;
        dmgRoll.render().then((dr) => {
          templateData.rollDamage = dr;
          renderTemplate(template, templateData).then((content) => {
            chatData.content = content;
            // 2 Step Dice So Nice
            if (game.dice3d) {
              game.dice3d
                .showForRoll(
                  roll,
                  game.user,
                  true,
                  chatData.whisper,
                  chatData.blind
                )
                .then(() => {
                  if (templateData.result.isSuccess) {
                    templateData.result.dmg = dmgRoll.total;
                    game.dice3d
                      .showForRoll(
                        dmgRoll,
                        game.user,
                        true,
                        chatData.whisper,
                        chatData.blind
                      )
                      .then(() => {
                        ChatMessage.create(chatData);
                        resolve(roll);
                      });
                  } else {
                    ChatMessage.create(chatData);
                    resolve(roll);
                  }
                });
            } else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
              resolve(roll);
            }
          });
        });
      });
    });
  }

  static async RollSave({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
  } = {}) {
    let rolled = false;
    const template = "systems/wwn/templates/chat/roll-dialog.html";
    let dialogData = {
      formula: parts.join(" "),
      data: data,
      rollMode: game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
    };

    let rollData = {
      parts: parts,
      data: data,
      title: title,
      flavor: flavor,
      speaker: speaker,
    };
    if (skipDialog) { return WwnDice.sendRoll(rollData); }

    let buttons = {
      ok: {
        label: game.i18n.localize("WWN.Roll"),
        icon: '<i class="fas fa-dice-d20"></i>',
        callback: (html) => {
          rolled = true;
          rollData.form = html[0].querySelector("form");
          roll = WwnDice.sendRoll(rollData);
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("WWN.Cancel"),
        callback: (html) => { },
      },
    };

    const html = await renderTemplate(template, dialogData);
    let roll;

    //Create Dialog window
    return new Promise((resolve) => {
      new Dialog({
        title: title,
        content: html,
        buttons: buttons,
        default: "ok",
        close: () => {
          resolve(rolled ? roll : false);
        },
      }).render(true);
    });
  }

  static async Roll({
    parts = [],
    data = {},
    skipDialog = false,
    speaker = null,
    flavor = null,
    title = null,
    rollTitle = null,
    dmgTitle = null,
  } = {}) {
    let rolled = false;
    const template = "systems/wwn/templates/chat/roll-dialog.html";
    let dialogData = {
      formula: parts.join(" "),
      data: data,
      rollMode: game.settings.get("core", "rollMode"),
      rollModes: CONFIG.Dice.rollModes,
    };

    let rollData = {
      parts: parts,
      data: data,
      title: title,
      flavor: flavor,
      speaker: speaker,
      rollTitle: rollTitle,
      dmgTitle: dmgTitle
    };
    if (skipDialog) {
      return ["melee", "missile", "attack"].includes(data.roll.type)
        ? WwnDice.sendAttackRoll(rollData)
        : WwnDice.sendRoll(rollData);
    }

    let buttons = {
      ok: {
        label: game.i18n.localize("WWN.Roll"),
        icon: '<i class="fas fa-dice-d20"></i>',
        callback: (html) => {
          rolled = true;
          rollData.form = html[0].querySelector("form");
          roll = ["melee", "missile", "attack"].includes(data.roll.type)
            ? WwnDice.sendAttackRoll(rollData)
            : WwnDice.sendRoll(rollData);
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("WWN.Cancel"),
        callback: (html) => { },
      },
    };

    const html = await renderTemplate(template, dialogData);
    let roll;

    //Create Dialog window
    return new Promise((resolve) => {
      new Dialog({
        title: title,
        content: html,
        buttons: buttons,
        default: "ok",
        close: () => {
          resolve(rolled ? roll : false);
        },
      }).render(true);
    });
  }
}
