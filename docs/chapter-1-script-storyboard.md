# Agentic primitives script and storyboard

Chapter 1 with Angie Jones. Target: 30 minutes; current narration estimate: 20:29. Learners use one retail customer service agent to explain and inspect a model, instructions, tools, the agent loop, conversation context, and saved preferences. They finish by checking behavior against concrete expectations.

## Recording plan

Throughout the narration, 'we' refers to the developers testing and inspecting the agent. Customer messages are entered on Alex's behalf and retain first-person wording such as 'my shoes' and 'my preferred shoe size'. Orders, shopping details, and saved preferences belong to Alex or the customer.

The timecodes estimate the edited video at approximately 163 spoken words per minute, based on the earlier Lesson 1 script (1,117 words) and a provisional recorded duration of 6:50. The current narration totals 3,339 words, for an estimated 20:29. Counts exclude bracketed cues, screen directions, code blocks, and on-screen example responses. Prompts spoken within the narration are included; separately reading prompts or responses adds time. No time is added for silent navigation, pauses, or model latency. Read the **Narration** passages aloud; **Screen** and **Production** passages are directions, not spoken copy.

Bracketed cues inside **Narration** are silent screen directions for Textream. Keep them in the teleprompter transcript and act on each cue before speaking the paragraph below it. Detailed **Screen** passages remain the setup reference.

**On-screen example response** blocks show the agent's replies for the script read-through; they are separate from Narration. Examples use the saved live-test wording, with source details in the production notes. Wording can vary between runs.

| Time | Lesson | Learner outcome | Primary screen |
| --- | --- | --- | --- |
| 00:00 to 06:48 | 1. Run the agent | Distinguish the model from the application that lets it act | Studio chat and agent definition |
| 06:48 to 11:19 | 2. Follow the agent loop | Trace a request through a model call, tool execution, and response | Studio Traces, agent definition, and concept slides |
| 11:19 to 12:38 | 3. Change the instructions | Compare how instructions affect behavior without adding capabilities | Editor and Studio chat |
| 12:38 to 15:34 | 4. Retain customer preferences | Distinguish conversation history from explicitly saved preferences | Studio chat, traces, and preference tools |
| 15:34 to 18:31 | 5. Change tool access | Explain tool capability and application-enforced data access | Editor, Studio chat, and trace |
| 18:31 to 20:29 | 6. Check the behavior | Use requests and evidence to assess the agent | Saved cases and rehearsal evidence |

All lesson and section timecodes follow the current narration in one continuous timeline. These are estimates, not measured recording durations. The original chapter target is 30 minutes; the current script is shorter. Most screen time remains in Studio and the editor, with concept slides for the agentic loop and context window.

### Before recording

- Complete environment setup separately. Have Studio running, fictional orders seeded, and the simulated customer set to Alex. Setup is outside the chapter timing.
- Open `apps/retail/src/mastra/agent.ts`, `apps/retail/src/mastra/tools.ts`, `packages/store/index.ts`, and `evals/chapter1-cases.json` in the editor. Keep credentials out of the recording.
- Begin with the original `exchangeInstruction`, `orderLookup: true`, and `defaultOptions.maxSteps: 5`. Confirm that Studio’s Max Steps setting also shows 5 before recording. The instruction and tool demonstrations edit this same agent.
- Before the take, run `npm run reset:preferences`, refresh Studio after the code reloads, and start a new thread. Confirm that `workingMemory.enabled` is `false`. The reset clears the custom preferences for `CUSTOMER_ID`, used by both Studio tools and terminal tools. Old Mastra working-memory records remain stored but are not supplied to this agent. Old messages still exist in their original threads, so a new thread is required for the opening request.
- Run `npm run rehearse:chapter1` before recording and keep its `evidence.json` available. This makes paid model requests and writes to an isolated store and trace database. Inspect the outcomes, including failures, before choosing recording examples.
- Rehearse the UI navigation in the installed Studio version. These directions name the target view without assuming an unverified button location.
- Keep a copy of the original exchange instruction for repeating the before-and-after recording. After Lesson 3, retain the revised instruction. After a configuration edit, wait for Studio to reload, refresh its page, verify the updated configuration, and start a new thread.

## Lesson 1. Run the agent

**Time:** 00:00 to 06:48 (estimated)
**Learning objective:** Identify the parts of an agent by inspecting a working customer service request.

### 00:00 to 01:09

**Screen**

Begin directly in Studio with **Retail customer service** selected and a blank conversation. During the opening narration, paste and submit Alex's request below. Keep the conversation visible as the agent responds.

```text
Can I exchange my shoes for a larger size?
```

**Narration**

> [Studio: new chat as Alex]
>
> "Congratulations, you're now in charge of your retail company's newly developed customer service agent. 
>
> We're signed in as Alex, a customer who wants to exchange a pair of shoes for a larger size. 
>
> [Send: Can I exchange my shoes for a larger size?]
>
> Notice the customer vaguely described what they want... as customers do, and now the  agent needs to work out how to respond using its instructions and the capabilities that it has.

**Screen**

**On-screen example response**

_What’s your order ID? I’ll check the order to identify the shoes, then ask which replacement size you want._

**Narration**

> [Chat: request for order ID]
>
> "Of course, the agent needs the order number before it can look up the shoes, so it asks for that."

**Screen**

In the same conversation, submit the following reply on Alex's behalf.

```text
order-1001
```

**On-screen example response**

_Order order-1001 contains one pair of Blue everyday sneakers (SKU shoe-blue-8), size 8. What replacement size would you like? I can’t check exchange eligibility or approve an exchange._

**Narration**

> [Send: order-1001. Show the response]
>
> "Given the order number, the agent successfully found the order which was a pair of blue sneakers in size 8.  
>
> It then asks the customer which size they'd like to replace these with.
>
> Which is kinda pointless because it then goes on to say that it doesn't have the ability to handle exchanges.
>
> This is the kind of stuff that annoys customers when your company rolls out its fancy new agent.
>
> As engineers, we can make this better. First, we need to understand why the agent responded this way. Let's open its definition and look at the instructions and capabilities it's been given.

### 01:09 to 06:48

**Screen**

Open `agent.ts`. Highlight `new Agent`, then `model`, `instructions`, `tools`, and `memory` as each is discussed in the narration. Within `memory`, point to each option as it is explained.

**Narration**

> [agent.ts: new Agent]
>
> "The agent is built using the open source framework, Mastra, and here's its definition.
>
> [model]
>
> It needs a model to process the information it's given and generate a response. 
>
> This is your first design decision to make. You shouldn't reach for the biggest, most expensive model on the market by default. Remember, you have end users engaging with this agent. 
>
> Ask yourself, given the tasks your agent needs to do, what's the most efficient yet affordable model you can use. 
>
> We're using `gpt-6-luna` here, which is a smaller model, because the agent's tasks are fairly focused.  It just needs to identify missing information, request an order lookup, and respond using the results. 
>
> Smaller models generally cost less and can respond faster, so they're a useful starting point for this kind of task. You can test whether the model follows instructions and uses tools correctly, and if it struggles, then try a more capable model. 
>
> ---
> [instructions]
>
> The instructions are critical system-level prompts that define the agent's identity and expertise, and we can also use these instructions to guide the agent's behavior.
>
> [Instructions: never invent order details; lookup unavailable]
>
> For example, we state that the agent is not allowed to make up details. Instead we tell it what to do if the tool isn't available, and we give it permission to fail versus making up order details just to give the customer an answer.
>
> [Instructions: ask for the order ID if missing]
>
> Also, we give it permission to ask for missing information. That's why it asked Alex for an order number. The lookup needs that information, so we've told the agent to ask for it rather than guess.
>
> ---
> [tools]
>
> We can also give the agents tools. This is what allows the agent to actually take actions.
>
> These can be tools that we've defined and implemented, or they can be external tools.
>
> [getOrder: hover over getOrderTool]
>
> For example, here is where we've registered the `getOrder` tool with the agent, and this tool maps to a function that we've implemented.
>
> Registering the tool makes it available to the model, along with its description. That description explains what the tool does and when to use it. 
>
> [Conditional getOrder registration: orderLookup]
>
> Notice that getOrder’s availability is conditional on the orderLookup setting; you could use the same approach to make a tool available based on a customer’s permissions or anything else.
>
> [readPreference and savePreference]
>
> There's two other tools here that I've created as custom memory helpers. In fact, let's look at agent memory.
>
> ---
>
> [memory]
>
> Here we are defining how our agent's memory should work.
>
> We're supplying earlier messages so the agent can follow the conversation. When Alex replies with just an order number, those earlier messages explain what Alex wants to do with that order.
>
> [lastMessages: 20]
>
> Here, we include the latest 20 messages from this thread. We could send the entire conversation, but the model processes that history with every request. As the conversation grows, that means more tokens to pay for and potentially slower responses. Models also have a limit on how much information they can receive in one call.
>
> Keeping the last 20 messages puts a bound on how much history we're sending, but there's a tradeoff. An important detail from earlier in the conversation might get left out. 20 isn't a magic number. We need to choose a limit that gives our agent enough history to handle the customer's request without sending more than it needs.
>
> One fascinating thing about memory is that there are several different types of memory and all of them work a bit differently. 
>
> [semanticRecall: false]
>
> For example, semantic recall would retrieve relevant messages based on their meaning rather than exact keywords. We've turned that off, so that we're using recent messages without that extra search.
>
> [workingMemory: enabled: false]
>
> Working memory lets the agent keep information across conversations. We've turned Mastra's built-in working memory off because we don't want the agent automatically carrying order details into the customer's next request.
>
> [tools: readPreference and savePreference]
>
> We still want customers to be able to save shopping preferences. For that, we've registered readPreference and savePreference tools. The agent can save a preference when the customer asks it to remember one, then retrieve that preference in another conversation. Buying a pair of shoes or requesting a replacement size doesn't by itself ask the agent to save a preference.
>
> ---
> All of these configurations shape how the agent responds, and also gives us a hint of which parts of the agent we might need to observe and tweak when its behavior is not ideal.
>
> We saw the agent ask Alex for more information even though it couldn't complete the exchange. Those questions might make sense for an agent that can process exchanges, but what are they helping this agent do?
>
> [exchangeInstruction: collect replacement details]
>
> The instructions we've given it shape that behavior. If we're telling it to collect replacement details, we need to consider whether collecting those details is useful with the tools it currently has. Or maybe even extend its capabilities by providing more tools.
>
> That's why we're looking at how this agent is configured. We want to understand what's leading it to ask those questions so we can decide what needs to change.
>
> In this case, we can already see why it's asking for replacement details. We've instructed it to do that, even though it can't complete the exchange.
>
> But when you're working on an agent, the cause won't always be this obvious. You might get an incorrect answer and need to find out whether the tool returned the wrong information or the model used that information incorrectly.
>
> So let's use this request to learn how to inspect what happened during a run. We'll follow the order lookup and see how the result became part of the agent's answer."

## Lesson 2. Follow the agent loop

**Time:** 06:48 to 11:19 (estimated)
**Learning objective:** Open a trace, follow the model and tool calls, and use their outputs to check the agent's answer.

### 06:48 to 09:35

**Screen**
Return to the **Retail customer service** agent chat in Studio.

**Narration**

> [Studio: original order-1001 chat]
>
> "Many people treat agents as black boxes. But as engineers we need to know how to peek inside that box and what to look for.
>
> Let's check the trace in Mastra Studio. "

**Screen**
Show "traces" definition slide.

**Narration**

> [Slide: trace definition]
>
> "A trace is a record of what the agent did during one run of the agent. We can use it to check whether the agent called the right tool and whether that tool returned the information it needed."

**Screen**
Back to Mastra Studio. Click **Traces**, beside **Chat** above the conversation. In the trace list, use the **Input** column and **Start** time to find the run triggered by Alex's reply containing `order-1001`. Click that row to open **Trace details**. Confirm that **Messages** shows the order-number reply before continuing.

**Narration**

> [Studio: Traces. Open the run for Alex’s order-1001 reply]
>
> "Let's open the run from when Alex supplied the order number. 
>
>In Trace details, we can follow the steps the agent took to answer Alex.
>
> [Span tree: memory recall, model steps, memory save]
>
> This tree shows what happened during the run. The conversation history is loaded from memory, then the model works through its steps, calling tools as needed. Then finally, the conversation is saved for the next message.

**Screen**

In **Span tree**, expand the rows under `agent run` and `llm` if needed. 
Point to `step: 0` and `step: 1`, then click the **`step: 0` label** to open its details. 
The arrow expands the tree; the label opens the recorded inputs and outputs.
In **INPUT**, show the **SYSTEM** instructions, then scroll through Alex's original request, the agent's question, and Alex's `order-1001` reply. Keep this input visible until the narration moves to the output.

**Narration**

> [Span tree: step: 0 and step: 1]
>
> "The numbering starts at zero, so step zero is the first step. 
>
> [Select step: 0 label. INPUT: SYSTEM instructions]
>
> Under Input, we have the instructions from our agent definition - that's going to be in every single step which is why I said whatever is in those instructions is critical.
>
> [INPUT: scroll to the conversation messages]
>
> The input also includes recent conversation history, up to the 20 messages we configured in the memory settings.

**Screen**

Stay on `step: 0`. Scroll to **OUTPUT**, find **TOOL CALLS (1)**, and expand **GetOrder**. Point to `orderId: "order-1001"` under **ARGUMENTS**.

**Narration**

> [step: 0 OUTPUT: expand GetOrder under TOOL CALLS; show orderId]
>
> "Now let's look at the output. The model has made a tool request. It wants the agent to run the `getOrder` tool and it supplied Alex's order number as the argument.
>
> The agent then runs that function, which we can inspect in the separate getOrder entry in the tree.

**Screen**

Select the `tool: 'getOrder'` span. 
Point to `orderId` in **INPUT**, then `found` and the purchased item in **OUTPUT**. 
Use **Expand** beside **OUTPUT** if needed. Keep the item name and size readable.

**Narration**

> [Select tool: getOrder. Show INPUT and OUTPUT]
>
> "Input shows what the function received, and Output shows what it returned. Here, the lookup found Alex's order and returned the blue sneaker in size 8.
>
>The database access happens in our code. We don't need the model to figure out how to query the database or decide whether Alex is allowed to access this order. We've already defined those rules, so we can enforce them with deterministic code. That gives us predictable checks without paying for another model call or waiting for its response.
>
>It also helps with debugging. If the agent gave Alex the wrong shoe size, this is one place we'd look.
>
>If the value was wrong in the tool result, we'd check the lookup code or the stored order. But if the value was correct here and wrong in the agent's answer, we'd investigate how the agent used that result."

**Screen**

Click the **`step: 1` label**. In **INPUT**, scroll to the **TOOL** entry labeled `[tool-result: getOrder]`, which follows the earlier messages and the tool request. Then scroll to **OUTPUT** and point to the purchased size in the response. Compare it with size 8 from the tool result just shown. Use the actual sequence if the recorded run contains additional calls; do not substitute an older trace with different instructions.

**Narration**

> [Select step: 1 label. INPUT: getOrder tool result]
>
> "Let's look at the next step. Along with the conversation, there is now a result from getOrder. The agent sent that result back to the model for another call, giving it information it didn't have in the first step.
>
> This cycle, where the agent repeatedly presents the model with information and then the model responds to the agent with the next action to take, is what's known as the agentic loop."

### 09:35 to 10:21

**Screen**

Show slide: [/Users/angie/workspace/mega_dev/course/slides/index.html](file:///Users/angie/workspace/mega_dev/course/slides/index.html)

**Narration**

> [Slide: The agentic loop]
>
> "When the model requests a tool, the agent runs it and sends the result back. The model can then use that result to respond or request another tool.
>
> Note that finishing a run doesn't mean the customer's problem is solved. In Alex's case, the model responded with a question, so this run ended and the agent waited for another customer message.
>
> As you're developing your agents, one important thing to consider is how many times the model can continue this loop.
>
> If a tool keeps returning an error, for example, we don't want the agent to keep trying indefinitely while the customer waits and we pay for more calls.
>
> We can set a limit on how many model steps a run can take."

### 10:21 to 11:19

**Screen**

Return to `apps/retail/src/mastra/agent.ts` in the editor. 
Scroll to `defaultOptions` and highlight `maxSteps: 5`. 
Keep the setting visible during the explanation.

**Narration**

> [agent.ts: defaultOptions → maxSteps: 5]
>
> "Here in our agent definition, we've added a default option that sets `maxSteps` to 5, which gives each run a limit of 5 model steps.
>
> A step is a call to the model, and that call can request more than one tool. So 5 steps doesn't mean 5 tool calls. It means the model can be called up to 5 times during that run.
>
> It's also a maximum, not a target. The agent can respond before it reaches the limit, which would be ideal."

**Screen**

Return to Mastra Studio and click **Traces**. 

**Narration**

> [Studio: original order-1001 trace; show step: 0 and step: 1]
>
> "So how do you choose a suitable limit for your agent?
>
> Well, you'll need to test the work the agent needs to do. You can run multiple scenarios via evals - which we'll cover in detail in a later chapter of this course - and we would measure how many steps it takes an agent to get to a successful result without excessive floundering.
>
> Our agent needed two steps. So 5 gives it a bit of buffer."

## Lesson 3. Change the instructions

**Time:** 11:19 to 12:38 (estimated)
**Learning objective:** Change an instruction to stop unnecessary exchange questions and verify the effect on the agent's behavior.

### 11:19 to 12:03

**Screen**

Return to Alex's existing conversation in Mastra Studio. 

**Narration**

> [Studio: original exchange conversation]
>
> "Now, back to the agent's annoying behavior where it's quizzing the user for exchange details even though it has no capability to process exchanges...
>
> We now know where to go to fix this, so let's do it."


**Screen**

Open `agent.ts`. 
Show `exchangeInstruction`, highlighting “Once the purchased item is verified, clarify what the customer wants instead, asking only for missing details.” 
Then point to `customerServiceConfig.exchangeInstruction` in the agent's instructions to show where this guidance reaches the model.

**Narration**

> [agent.ts: original exchangeInstruction]
>
> "Here in the instructions is where we're telling the agent to collect replacement details. We also tell it that it can't process exchanges. So we've given it instructions to gather information it can't use.
>
> [instructions: customerServiceConfig.exchangeInstruction]
>
> So really this is our fault... and then people blame it on AI.
>
> As engineers, we can change that behavior. For now, we want it to explain that exchanges aren't supported and stop asking exchange questions. It should still help when a customer asks to look up an order."

### 12:03 to 12:13

**Screen**

Replace the entire value assigned to `exchangeInstruction` with this string, including removing the old array and `.join('\n')`. 
Leave `clarificationInstruction` unchanged; the revised exchange instruction no longer includes it. Keep the model and tools unchanged.

```typescript
export const exchangeInstruction =
  'For exchange requests, say that you cannot process exchanges. ' +
  'Respond directly without calling tools or asking for an order ' +
  'number, item choice, or replacement details. If the customer ' +
  'separately asks for order information, help with that lookup.';
```

Save the file, wait for Studio to reload, and refresh its page. Confirm that the new instruction is displayed in Studio. 
Start a new thread and test the same exchange scenario using the request below. Include the order number so the new conversation has both details Alex supplied in Lesson 1. 

```text
Can I exchange the shoes in order-1001 for a larger size?
```

**Narration**

> [Replace exchangeInstruction with the prepared revised version. Save]
>
> "We'll leave everything else the same... the model, the order, and the tools.
>
> [Studio: refresh; verify revised instruction; start a new thread]
>
> I'm starting a new thread so that the agent has fresh context."

**On-screen example response**

_I can’t process exchanges. Please contact the store’s customer service team to ask about exchanging the shoes for a larger size._

### 12:13 to 12:38

**Narration**

> [Send: Can I exchange the shoes in order-1001 for a larger size? Show the response]
>
> "Great, that's much better.
>
> Models are non-deterministic, but we do have a bit of control.
>
> The system instructions are included with every call to the model.
>
> That means the agent gets that guidance again on every turn.
>
> Now, I don't want to mislead you. Instructions don't _guarantee_ that the model will always behave as intended. But at least you've done your part to guide it in the right direction.

## Lesson 4. Memory across conversations

**Time:** 12:38 to 15:34 (estimated)
**Learning objective:** Follow an explicit preference save and retrieval across conversations, and distinguish saved preferences from order facts.

### 12:38 to 14:46

**Screen**

Open the local deck at `course/slides/index.html#2`, showing **Context window**. Press **R** to begin with the empty box. Press **Space** at each `[click]` cue in the narration.

Stay on the slide until “Let's see how that works,” then return to Mastra Studio for the preference lookup below.

**Narration**

> [Slide: Context window. Press R to reset]
>
> "The model itself is stateless. It has no recollection of previous calls. So, every time our agent calls the model, it has to supply all of the information that the model needs to respond.
>
> That information is its context. The context _window_ is the limit on how much the model can work with at once
>
> [click]
>
> The system instructions are part of that context.
>
> [click]
>
> Our agent also includes up to the last 20 messages from the conversation, which is inclusive of the user's prompts as well as the model's responses.
>
> [click]
>
> It also supplies information about the available tools such as their names and descriptions, along with the arguments each tool accepts. If a tool has already run, its result is included too.
>
> As a conversation grows, we need to decide what to keep sending.
>
> Remember we've limited the message history to 20 messages - some of the older messages before then may still  be relevant, and some of it may not.
>
> [click]
>
> Compaction is helpful here. It's where older messages are compressed into shorter notes that are included with recent messages.
>
> The tradeoff is that those notes may leave out details.
>
> [click]
>
> We can also save specific information separately from the conversation. Our agent can retrieve that preference when it’s needed and include it in the model’s context.
>
> Let's see how that works."


**Screen**

Start a new thread in Alex's session. Submit the following question before saving a preference. 

```text
What is my preferred shoe size?
```

**On-screen example response**

_I don’t have a preferred shoe size saved for you._

**Narration**

> [Studio: new thread as Alex. Send: What is my preferred shoe size?]
>
> "Let's first ask whether the agent has a saved shoe size for Alex.
>
> [Expand readPreference in chat]
>
> We see that it calls the readPreference tool, which is a tool we implemented to read this information from the store. 
>
> [readPreference result: found: false]
>
> The result says it wasn't found, which is exactly what we expect because we have not saved this preference yet.
>
> Let's go ahead and store it.
>
> [Use Wispr Flow to type the next sentence]
>
> Please remember my preferred shoe size is 9.

**Screen**

Return to **Chat** and submit the following message.

```text
Please remember my preferred shoe size is 9.
```

**On-screen example response**

_I've saved your preferred shoe size as 9._

Expand tool call.

**Narration**

> [Send the preference message. Expand savePreference in chat]
>
> "This time, the model calls the savePreference tool which writes that preference to the database and returns confirmation."

**Screen**

Start a new thread and ask the same question again. 
Expand tool call.

```text
What is my preferred shoe size?
```

**On-screen example response**

_Your saved preferred shoe size is 9._

**Narration**

> [New thread. Send: What is my preferred shoe size? Expand readPreference]
>
> "Wonderful. So we know our agent is capable of remembering and recalling things outside of a chat session, but there's a bit more to consider.
>
> When you add memory to an agent, decide what's worth remembering. 
>
> Let's look at the functions for these tools."

### 14:46 to 15:34

**Screen**

Open `tools.ts` and show the descriptions and schemas for `savePreference` and `readPreference`. Open `packages/store/preferences.ts` and point to the category list, then the database write and read. Keep each relevant function visible separately at a readable font size.

**Narration**

> [tools.ts: savePreferenceTool and readPreferenceTool]
>
> "We're making a deliberate choice about what should carry across conversations. A customer might discuss one order today and a different order tomorrow. We don't want a remembered order number silently deciding which purchase their next request is about.
>
> [agent.ts: workingMemory.enabled: false]
>
> We've disabled automatic working memory in the agent definition and instead provided tools specifically for shopping preferences.
>
> [tools.ts: hover over preferenceInput]
> The save tool's schema accepts categories such as shoe size and shirt size.
>
> [tools.ts: savePreferenceTool description]
>
> The tool description tell the model to save only when the customer asks it to remember a preference.
>
> [Preference tool execute: settings.customerId]
>
> Our agent pulls the customer's identity when it reads or writes a preference.
>
> [packages/store/preferences.ts: customer ID and category in write/read]
>
> And the database stores each category separately for each customer, another customer's lookup doesn't return Alex's preferences, for example.
>
> Let's dive a bit more into the power of tools."

## Lesson 5. Change tool access

**Time:** 15:34 to 18:31 (estimated)
**Learning objective:** Explain why instructions cannot replace a missing tool and locate the code that enforces order ownership.

### 15:34 to 16:36

**Screen**

Show `agent.ts` with `customerServiceConfig.orderLookup` and the conditional `getOrder` registration visible.

**Narration**

> [agent.ts: customerServiceConfig.orderLookup and conditional getOrder]
>
> "Let's go to our agent definition.
>
> We've seen the agent retrieve order details using getOrder.
>
> Now  I want to show you what happens if we remove that tool, and how the agent responds when it can no longer look up an order.
>
> Remember, getOrder is conditionally available. This orderLookup setting controls whether it's included in the tools we give the model. I'll change it to false."

**Screen**

Change only `customerServiceConfig.orderLookup` from `true` to `false` and save. 

Wait for Studio to reload, refresh its page, and show the agent's tool list in the Config panel (upper right icon)

**Narration**

> [Set orderLookup: false; save. Refresh Studio; Config → Tools]
>
> "Now getOrder is no longer available to the agent. 
>
> Let's start a fresh thread and ask it about an order."

**Screen**

Start a new thread in Alex's session and submit the request below. Keep the response visible. Expand any tool calls directly in Chat to inspect what the agent used.

```text
What did I buy in order-1001?
```

**On-screen example response**

_I can’t look up order-1001 here, so I can’t verify what you bought._

**Narration**

> [New thread. Send: What did I buy in order-1001? Show the response]
>
> "So the agent sent the model the system instructions, the user's prompt, and info about the tools it had access to which are only the read and save preferences tools.
>
> The model does not have access to a database. It only has access to whatever information the agent has provided to it.
>
> When we removed this tool from the agent, it no longer has access to that so it can't share that with the model.
>
> So tools are what agents use to take action."

### 16:36 to 17:43

**Screen**

Restore `orderLookup: true` and save. Wait for Studio to reload, refresh its page, and confirm that `getOrder` appears in the agent's tool list. 
Open `getOrderTool` in `tools.ts`. Highlight its description, `inputSchema`, and `execute` function in turn.

**Narration**

> [Restore orderLookup: true; save. Verify getOrder in Studio. Open tools.ts: getOrderTool]
>
> "Let's inspect the tool definition.
>
> [getOrderTool: description]
>
> The description says, 'Retrieve an order belonging to the current customer.' That tells the model what the tool does. The next sentence says to use it to verify order details before answering questions about a purchase. That tells the model when to use it.
>
> We've kept that guidance with the tool rather than repeating it in the agent's instructions. The instructions still say not to invent order details and what to do when lookup isn't available. We need those rules even when this tool isn't registered.
>
> [inputSchema]
>
> The input schema defines the input the tool accepts, which in this case is an order ID.
>
> [execute]
>
> And the execute function contains the application code that performs the lookup.
>
> Those parts have different jobs.
> - A clear description helps the model select the appropriate tool.
> - A schema lets the application validate the shape of the request.
> - The implementation determines what actually happens.
>
> An order ID being a valid string doesn't mean the customer is allowed to see that order. So we also need to check access in the implementation as well."

### 17:43 to 18:31

**Screen**

Open `getOrder` in `packages/store/index.ts`. Highlight `WHERE id = ? AND customer_id = ?`, then `.get(orderId, customerId)`. Point to the `if (!row)` branch as you explain what happens when no matching order is found.

**Narration**

> [packages/store/index.ts: getOrder → WHERE id = ? AND customer_id = ?]
>
> "Here's where we enforce access. The query requires both the requested order ID and the current customer's ID to match.
>
> This is common sense programming, but let's face it, many of us aren't coding much anymore. So I just want to point out how important for us to remember the logic, even if we're not the ones writing the code.
>
> [getOrder: .get(orderId, customerId), then if (!row)]
>
> So, if Alex supplies someone else's order number, that combination won't match. And the function returns 'Order not found for this customer' without returning the other customer's order details.
>
> So the model can request a lookup, but our code controls which record it can retrieve. That access check runs every time the tool performs a lookup, so we aren't relying on the model to follow an instruction about customer privacy."

## Lesson 6. Check the behavior

**Time:** 18:31 to 20:29 (estimated)
**Learning objective:** Evaluate observable behavior against expected outcomes and choose where to investigate a failure.

### 18:31 to 20:00

**Screen**

Open `evals/chapter1-cases.json`. 
Show the case named in brackets as you discuss it. 
Then open the pre-recording rehearsal's `data/chapter1/<run-id>/evidence.json`. Show a request, answer, tool results, step count, finish reason, token usage, and trace ID. Production overlay for this segment: "Saved rehearsal output".

**Narration**

> [evals/chapter1-cases.json]
>
> "One more thing before we wrap up this chapter... I want to touch on how we test this agent with evals.
>
> Evals are tests where we give the agent a request and check its behavior against what we expect. 
>
> These cases use our fictional customer Alex and orders we’ve created as test data. Because we know what’s in those orders, we can check whether the agent retrieves and reports the correct information.
>
> For a production agent, we’d expand this set to cover different customers and situations.
>
> Ok, each case describes the behavior we expect, rather than requiring one exact sentence.
>
> [lookup-after-instruction-change]
>
> For a direct order question, we check that the agent calls getOrder and reports the correct purchased item. A plausible answer isn't enough; we want to see that it used the store's data.
>
> [unsupported-owned-exchange]
>
> For an exchange request, we check that the agent explains its limitation without collecting more details or claiming that an exchange has been approved. This checks whether the instruction change we made actually stops the unnecessary questions.
>
> [another-customers-order]
>
> When querying another customer's order, we check that the lookup returns no accessible order and that the answer doesn't disclose its contents. This checks both the access rule in our code and how the agent responds when access is denied.
>
> [Saved rehearsal evidence.json: request, answer, tool results and step count]
>
> Just like any application tests, it's a good idea to rerun these cases after changing the agent's instructions, tools, or model to check whether a change broke behavior that was working before."

### 20:00 to 20:29

**Screen**

Return to the agent definition. Point to `model`, `instructions`, `tools`, and `memory` as each is mentioned. Keep the definition visible for the rest of the recap.

**Narration**

> [agent.ts: model, instructions, tools and memory]
>
> "In this chapter, we explored the primitives that make up an agent and how the model, system instructions, tools, context, and memory all come together within the agentic loop.
>
> As engineers, we decide how to configure these pieces. We can inspect their behavior and tweak these configurations to have the agent work as we intended.
>
> In the next chapter, we’ll build on this retail agent and start giving it the capabilities to actually handle an exchange and introduce a decision model to help it decide what to do next. "

---



## Production notes and references

### Scope and continuity

This script covers Chapter 1, not the entire multi-chapter course. Exchange eligibility, inventory, approvals, exchange mutation, MCP, A2A, skills, and multi-agent orchestration are outside this checkpoint. Asking a customer for a size is a clarification, not an approval workflow.

Only `retailAgent` is registered. Lesson 5 changes `customerServiceConfig.orderLookup` on that agent; the preference tools remain available.

For the visual in Lesson 2, allow the producer to reveal the actual sequence one operation at a time. Use the recorded trace as the visual's factual reference. The app remains the default screen for definitions and explanations elsewhere.

### Example response sources

Lesson 3 revisits the existing Lesson 1 conversation, then tests the revised instruction in a fresh thread with the exchange request and `order-1001` together. The examples are the actual `owned-order` and `unsupported-owned-exchange` responses in the [instruction-change rehearsal](../data/chapter1/6c82f4ac-d076-4fdf-be88-6ddb312495c6/evidence.json). Later lessons retain this instruction and use direct order questions when demonstrating lookup tools.

The order and conversation-history examples are retained from the [earlier live rehearsal](/Users/angie/workspace/mega-course-agents/data/chapter1/e1a086fa-b334-483a-a4fe-d6bca9d51161/evidence.json). Those recordings used earlier instructions. The opening order-ID question came from Angie's separate manual test; the opening two-turn exchange isn't recorded in that evidence file. Exact wording may change.

Earlier working-memory rehearsal results describe the previous implementation. The instruction-change rehearsal checks the original exchange behavior before switching to the revised instruction. It then verifies that unsupported exchanges require no follow-up details or tool calls, direct order lookups still work, and explicit preferences survive a new thread. Each saved result includes the active exchange instruction, so compare outcomes against the configuration used for that run.

### Handling live variation

- If a lookup doesn't occur, inspect the available tools and actual trace before attributing the answer to store data.
- If the instruction comparison doesn't produce the intended difference, keep the result and explain the mismatch. Don't promise deterministic wording.
- If a preference isn't retained, inspect savePreference and its result, then check readPreference and the configured customer ID. Don't describe a failed save as persistent memory.
- If ownership or unsupported-exchange behavior fails, stop the take and investigate before using that run as a correct demonstration.
- Cut or accelerate excess waiting. Keep enough time for viewers to read inputs and returned data, and retain the prediction pauses.

### Source material

The local application defines the specific behavior demonstrated here. The supplied previous course script informs the explanatory style, screen directions, and progression from concept to demonstration.

- [Chapter 1 walkthrough](chapter-1.md)
- [Agent definition and configuration](../apps/retail/src/mastra/agent.ts)
- [Order lookup tool](../apps/retail/src/mastra/tools.ts)
- [Store access](../packages/store/index.ts)
- [Mastra working memory](https://mastra.ai/docs/memory/working-memory)
- [Agent registration and trace storage](../apps/retail/src/mastra/index.ts)
- [Saved behavior cases](../evals/chapter1-cases.json)
- [Rehearsal and evidence recording](../scripts/chapter1-evidence.ts)
- [Style reference supplied by Angie](/Users/angie/Downloads/Scripts_GiveYourAIAgentsSkills.md)

For further reading on the framework's general concepts, see the official [Mastra agents overview](https://mastra.ai/docs/agents/overview), [tool documentation](https://mastra.ai/docs/agents/tools), and [memory overview](https://mastra.ai/docs/memory/overview). Use the repository's installed version and configuration when rehearsing this course.
