async function fetchAllMondayItems() {
  let allItems = [];
  let cursor = null;
  do {
    const query = cursor 
      ? `query { next_items_page(cursor: "${cursor}") { cursor items { id name column_values { title text value } } } }`
      : `query { boards(ids: [${BOARD_ID}]) { items_page { cursor items { id name column_values { title text value } } } } }`;
      
    const response = await axios({
      url: 'https://api.monday.com/v2/',
      method: 'post',
      headers: {
        'Authorization': MONDAY_API_KEY,
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ query })
    });
    
    if (cursor) {
      const page = response.data.data.next_items_page;
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
    } else {
      const page = response.data.data.boards[0].items_page;
      allItems = allItems.concat(page.items);
      cursor = page.cursor;
    }
  } while (cursor);
  
  return allItems;
}
