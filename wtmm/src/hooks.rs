use rusqlite::hooks::Action;

pub fn update(action: Action, db_name: &str, table_name: &str, row_id: i64) {
    println!("{:?},{:?},{:?},{:?}", action, db_name, table_name, row_id);
}
