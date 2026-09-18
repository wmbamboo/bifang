import React, { useState } from "react";
import {message, Table} from "antd";
import { ColumnsType } from "antd/lib/table";

interface DataType {
  key: string;
  name: string;
  age: number;
  address: string;
}

const MyTable: React.FC = () => {
  const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleSingleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>, record: T) => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      setClickTimeout(null);
      console.log("Double click");
    } else {
      setClickTimeout(
        setTimeout(() => {
          console.log("Single Click");
          message.info("Single Click");
          // 在这里执行单击事件的处理逻辑
          setClickTimeout(null);
        }, 300)
      );
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLElement, MouseEvent>, record: T) => {
    clearTimeout(clickTimeout as NodeJS.Timeout);
    setClickTimeout(null);
    console.log("Double click");
    message.info("Double click");
    // 在这里执行双击事件的处理逻辑
  };

  const data: DataType[] = [
    {
      key: "1",
      name: "xiaohong",
      age: 18,
      address: "xxxxxx",
    },
    {
      key: "2",
      name: "xiaoming",
      age: 10,
      address: "xxxxxxx",
    },
  ];

  const columns: ColumnsType<DataType> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "Age",
      dataIndex: "age",
      key: "age",
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
    },
  ];

  return (
    <Table<DataType>
      dataSource={data}
      columns={columns}
      onRow={(record) => {
        return {
          onClick: (e) => handleSingleClick(e, record),
          onDoubleClick: (e) => handleDoubleClick(e, record),
      };
      }}
    />
  );
};

export default MyTable;
