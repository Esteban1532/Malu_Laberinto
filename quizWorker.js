let questions = [];
let used = [];

onmessage = (e) => {
  const data = e.data;

  if (data.type === "init") {
    questions = data.questions || [];
    used = [];
  }

  if (data.type === "getQuestion") {
    if (questions.length === 0 || used.length === questions.length) {
      postMessage({ type: "noMore" });
      return;
    }

    let q;
    do {
      q = questions[Math.floor(Math.random() * questions.length)];
    } while (used.includes(q));

    used.push(q);
    postMessage({ type: "question", q });
  }
};
