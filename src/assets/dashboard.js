/* selecting the currently active bar:
 *
 * on-load, checks the url hash. If there is a hash, use it to locate the bar
 * to select.
 *
 * then, attach an event handler to every bar so we can detect when they are
 * clicked on.
 * */

const hash = window.location.hash;
const selected = document.querySelector(`a[href='${hash}']`);
if (selected) {
  selected.classList.add("bar-selected");
}

const bars = document.querySelectorAll("a.bar");

for (const bar of bars) {
  bar.addEventListener("click", handleBarClick);
}

function handleBarClick(event) {
  for (const el of document.querySelectorAll(".bar-selected")) {
    if (el !== this) {
      el.classList.remove("bar-selected");
    }
  }

  this.classList.toggle("bar-selected");
}
