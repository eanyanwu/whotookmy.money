const containers = document.querySelectorAll(".bar-container");

for (const container of containers) {
  container.addEventListener("click", handleBarContainerClick);
}

/* Display itemized transactions on click */
function handleBarContainerClick(event) {
  const purchaseDate = this.dataset.purchaseDate;
  // Find the detail section with this
  const purchaseDetail = document.querySelector(
    `.purchase-detail[data-purchase-date='${purchaseDate}']`
  );

  // Hide any previously shown detail section
  for (const el of document.querySelectorAll(".purchase-detail")) {
    if (el !== purchaseDetail) {
      el.classList.add("dn");
    }
  }

  // Deselect any previously selected bars
  for (const el of document.querySelectorAll(".bar-container-selected")) {
    if (el !== this) {
      el.classList.remove("bar-container-selected");
    }
  }

  // `purchaseDetail` might be null when there are no purchaess for that date
  if (!purchaseDetail) {
    return;
  }

  // Toggle the bar selection
  this.classList.toggle("bar-container-selected");
  // Toggle the purchase detail visibility
  purchaseDetail.classList.toggle("dn");
}
