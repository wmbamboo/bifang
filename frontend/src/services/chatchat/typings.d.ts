declare namespace API {
  interface Response<T = any> {
    code: number;
    msg: string;
    data: T;
  }
  interface KnowledgeBase {
    kb_name: string;
    kb_info: string;
    vs_type: string;
    embed_model: string;
  }

  interface Document {
    id: string;
    file_name: string;
    page_content: string;
    metadata: {
      source: string;
      [key: string]: any;
    };
  }

  interface SearchResult {
    id: string;
    page_content: string;
    metadata: {
      source: string;
      [key: string]: any;
    };
    score?: number;
  }

 //知识库管理数据类型
  type KbListItem = {
    id: number;
    kb_name: string;
    kb_info: string;
    vs_type?: string;
    embed_model?: string;
    file_count?: string;
    createTime?: Date;
  };

  type KbPageParams = {
    current?: number;
    pageSize?: number;
    name?: string;
  };
  type KbItem = {
    knowledge_base_name: string;
    kb_info: string;
    vector_store_type: string;
    embed_model: string;
  };
  type KnowledgeBaseFile = {
    id?: string;
    kb_name?: string;
    file_name?: string;
    file_ext?: string;
    file_version?: string;
    document_loader?: string;
    docs_count?: number;
    text_splitter?: string;
    in_folder?: boolean|undefined;
    in_db?: boolean;
    file_mtime?: number;
    file_size?: string;
    custom_docs?: string;
    create_time?: string;
  };
  type KbFilePageParams = {
    current?: number;
    pageSize?: number;
    query?: string;
  };
  interface KbFileSearchParams {
    kb_name?: string;
    query?: string;
  }
 //用户管理
  interface UserType {
    userid: string,
    username:string,
    password:string,
    name: string,
    access?:string,
    email?:string,
    phone?:string,
    unit?:string,
    dept?:string,
    address?:string,
    signature?:string,
    avatar?:string,
  }

  type LoginUser = {
    userid?: string,
    username:string,
    password:string,
    name: string,
    access?:string,
    email?:string,
    phone?:string,
    unit?:string,
    dept?:string,
    address?:string,
    signature?:string,
    avatar?:string,
  };

}
